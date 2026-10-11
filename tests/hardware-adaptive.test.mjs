import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveElectricalSimulator } from '../packages/hardware-sim/adaptive.js';
import { ElectricalSimulator } from '../packages/hardware-sim/electrical.js';
import { MixedSignalSimulator } from '../packages/hardware-sim/mixed.js';
import { HardwareSession } from '../packages/hardware-sim/session.js';
import { hardwareExamples } from '../packages/hardware-sim/examples.js';

const circuit = () => JSON.parse(hardwareExamples().at(-1).source);
const near = (value, expected, tolerance) => assert.ok(Math.abs(value - expected) < tolerance, `${value} != ${expected}`);
test('adaptive RC integration reaches the exact observation endpoint with controlled internal error', () => {
    const s = new AdaptiveElectricalSimulator(circuit()), result = s.step(.001);
    assert.equal(result.time, .001); near(s.voltage('out'), 5 * (1 - Math.exp(-1)), .003);
    assert.ok(result.integration.acceptedSteps > 1); assert.ok(result.integration.rejectedSteps > 0);
    assert.ok(result.integration.maxNormalizedError <= 1); assert.equal(s.history.length, 1);
    near(s.branchCurrent('V1'), -(5 - s.voltage('out')) / 1000, 1e-10);
});
test('fixed integration remains byte-for-byte compatible when adaptation is not enabled', () => {
    const c = circuit(); delete c.integration;
    const fixed = new ElectricalSimulator(c), optional = new AdaptiveElectricalSimulator(c);
    for (let i = 0; i < 12; i++) { assert.deepEqual(optional.step(.0001), fixed.step(.0001)); assert.deepEqual(optional.snapshot(), fixed.snapshot()); }
});
test('stricter local tolerances reduce measured RC global error without asserting a global bound', () => {
    const errors = [];
    for (const rtol of [1e-2, 1e-4, 1e-6]) {
        const s = new AdaptiveElectricalSimulator(circuit());
        s.stepAdaptive(.001, { relativeTolerance: rtol, voltageTolerance: 1e-9, currentTolerance: 1e-12 });
        errors.push(Math.abs(s.voltage('out') - 5 * (1 - Math.exp(-1))));
    }
    assert.ok(errors[1] < errors[0] / 2); assert.ok(errors[2] < errors[1] / 2);
});
test('RL current and negative-supply RC behavior agree with analytic solutions', () => {
    const rl = new AdaptiveElectricalSimulator({ nodes: ['0', 'in', 'out'], components: [
        {name:'V',type:'V',p:'in',n:'0',source:1}, {name:'R',type:'R',p:'in',n:'out',value:10}, {name:'L',type:'L',p:'out',n:'0',value:.01} ] });
    rl.stepAdaptive(.001, { relativeTolerance: 1e-5 }); near(rl.branchCurrent('L'), .1 * (1 - Math.exp(-1)), .0001);
    const c = circuit(); c.components[0].source = -5;
    const rc = new AdaptiveElectricalSimulator(c); rc.step(.001); near(rc.voltage('out'), -5 * (1 - Math.exp(-1)), .003);
});
test('source slope changes are exact substep boundaries and overrides suppress obsolete breakpoints', () => {
    const c = circuit(); c.components[0].source = { pwl: [[0,0], [.0001,0], [.000101,5], [.001,5]] };
    const s = new AdaptiveElectricalSimulator(c), targets = [], solve = s._solve.bind(s);
    s._solve = (dt, time) => { targets.push([time - dt, time]); return solve(dt, time); };
    const result = s.step(.001); assert.equal(result.integration.sourceBreakpoints, 2);
    for (const t of [.0001, .000101]) { assert.ok(targets.some(pair => pair[1] === t)); assert.ok(targets.every(([start,end]) => !(start < t - 1e-15 && end > t + 1e-15))); }
    s.setSource('V1', 2); assert.equal(s.step(.001).integration.sourceBreakpoints, 0);
});
test('failed subdivision budget or singular circuit leaves public state and history unchanged', () => {
    const s = new AdaptiveElectricalSimulator(circuit()); s.step(.00001);
    const before = s.snapshot(), history = structuredClone(s.history);
    assert.throws(() => s.stepAdaptive(.001, { maxTrials: 1, relativeTolerance: 1e-10 }), /budget/);
    assert.deepEqual(s.snapshot(), before); assert.deepEqual(s.history, history);
    assert.throws(() => s.stepAdaptive(.001, { minStep: .001, relativeTolerance: 1e-10 }), /minimum/);
    assert.deepEqual(s.snapshot(), before);
    const floating = new AdaptiveElectricalSimulator({nodes:['0','a','b'],components:[{name:'R',type:'R',p:'a',n:'b',value:100}]});
    const snap = floating.snapshot(); assert.throws(() => floating.stepAdaptive(1e-4, {maxTrials: 3}), /budget/); assert.deepEqual(floating.snapshot(), snap);
});
test('a late nonlinear failure rolls back all accepted internal substeps', () => {
    const s = new AdaptiveElectricalSimulator(circuit()), initial = s.snapshot(), solve = s._solve.bind(s); let injected = false;
    s._solve = (dt, time) => { if (time > .0003) { injected = true; throw new Error('injected transistor convergence failure'); } return solve(dt, time); };
    assert.throws(() => s.stepAdaptive(.001, {maxTrials: 1000}), /interval unchanged/);
    assert.ok(injected); assert.deepEqual(s.snapshot(), initial); assert.equal(s.history.length, 0);
});
test('one reverse operation restores a whole observation interval and independent snapshots resume exactly', () => {
    const s = new AdaptiveElectricalSimulator(circuit()); s.step(.001); const before = s.snapshot(); s.step(.001); const after = s.snapshot();
    assert.ok(s.back()); assert.deepEqual(s.snapshot(), before);
    const copy = new AdaptiveElectricalSimulator(circuit()); copy.restore(before); copy.step(.001); assert.deepEqual(copy.snapshot(), after);
});
test('adaptive circuit metadata and invalid intervals fail visibly', () => {
    for (const integration of [{mode:'magic'}, {mode:'adaptive',relativeTolerance:0}, {mode:'adaptive',maxTrials:Infinity}, {mode:'adaptive',ignored:true}])
        assert.throws(() => new AdaptiveElectricalSimulator({...circuit(),integration}));
    const s = new AdaptiveElectricalSimulator(circuit()), before = s.snapshot();
    for (const dt of [NaN, Infinity, 0, -1]) assert.throws(() => s.step(dt));
    assert.throws(() => s.stepAdaptive(.001, {voltageTolerance:NaN})); assert.deepEqual(s.snapshot(), before);
    s.time = 1e20; assert.throws(() => s.step(.001), /representable/);
});
test('mixed adaptive electronics preserves DAC hold duration and exactly one digital edge per interval', () => {
    const doc = JSON.parse(hardwareExamples().find(e => e.kind === 'mixed').source);
    doc.circuit.integration = {mode:'adaptive',relativeTolerance:1e-3};
    const s = new MixedSignalSimulator(doc); s.step(1e-5);
    assert.equal(s.time, 1e-5); assert.equal(s.digital.ticks, 1); assert.equal(s.digital.read('sample'), 1n);
    s.step(1e-5); assert.equal(s.time, 2e-5); assert.equal(s.digital.ticks, 2); assert.equal(s.digital.read('sample'), 0n);
    assert.ok(s.back()); assert.equal(s.time, 1e-5); assert.equal(s.digital.ticks, 1);
});
test('adaptive browser session source, endpoint, voltage and checkpoints round trip', async () => {
    const s = new HardwareSession(); await s.load(hardwareExamples().at(-1));
    const result = await s.advance({operation:'clock',step:.001});
    assert.equal(result.time,.001); near(result.series.at(-1).values.out,5*(1-Math.exp(-1)),.003);
    const text=s.exportSnapshot(), copy=new HardwareSession(); await copy.restoreSnapshot(text); assert.equal(copy.exportSnapshot(),text);
    s.back(); assert.equal(s.summary().time,0); s.dispose(); copy.dispose();
});
