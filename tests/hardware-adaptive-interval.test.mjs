import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HardwareSession} from '../packages/hardware-sim/session.js';
import {hardwareExamples} from '../packages/hardware-sim/examples.js';
const circuit=()=>JSON.parse(hardwareExamples().at(-1).source);
test('session adaptive subdivision retains the requested interval across source breakpoints', async () => {
    const c = circuit(); c.components[0].source = {pwl:[[0,0],[.0001,0],[.000101,5],[.001,5]]};
    const s = new HardwareSession(); await s.load({kind:'electrical',source:JSON.stringify(c)});
    const result = await s.advance({operation:'clock',step:.001});
    assert.equal(result.time,.001); assert.equal(s.simulator.history.length,1); s.dispose();
});
test('mixed session adaptive integration retains one digital edge across independent source knots', async () => {
    const doc = JSON.parse(hardwareExamples().find(e => e.kind === 'mixed').source);
    doc.circuit.integration = {mode:'adaptive',relativeTolerance:1e-3};
    doc.circuit.components.find(c=>c.name==='VCC').source={pwl:[[0,5],[.000005,5],[.000006,4.9],[.001,4.9]]};
    const s=new HardwareSession();await s.load({kind:'mixed',source:JSON.stringify(doc)});
    const result=await s.advance({operation:'clock',step:.00001});
    assert.equal(result.time,.00001);assert.equal(result.ticks,1);s.dispose();
});
