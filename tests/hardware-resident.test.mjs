import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetlistBuilder } from '../packages/hardware-sim/netlist.js';
import { DigitalSimulator, Waveform } from '../packages/hardware-sim/digital.js';
import { Gate } from '../packages/hardware-sim/logic.js';
import { packResidentPlan, decodeResidentResult, NO_WRITE } from '../packages/hardware-sim/resident-plan.js';
import { residentShader } from '../packages/hardware-sim/resident-shader.js';
import { GPUResidentSimulator } from '../packages/hardware-sim/resident.js';

function make() {
    const b = new NetlistBuilder('resident ABI fixture'), r = b.register('counter', 8), enable = b.input('write', 1, 1n);
    r.connect(b.add(r.q, b.constant(1, 8)).sum); b.output('counter', r.q);
    b.output('data', b.ram('first', { width: 8, depth: 256, address: r.q, data: b.bits(Gate.NOT, r.q), write: enable[0], readonly: [[4, 7]] }));
    b.ram('second', { width: 1, depth: 256, address: r.q, data: [r.q[0]], write: enable[0] });
    return b.compile();
}
/** CPU-generated wire/storage records test only the ABI decoder, not the WGSL.
 * The real GPU conformance harness separately executes the shader in Chromium. */
function recorded(layout, sim, count) {
    const words = new Uint32Array(layout.resultWords), wave = new Waveform(sim.plan, layout.signals.map(s => s.name));
    words[0] = count; words[2] = 0x54583247;
    for (let i = 0; i < count; i++) {
        sim.clock(); const h = sim.history.at(-1), at = layout.recordsOffset + i * layout.recordWords;
        words.set(h.roots, at);
        layout.memoryLayout.forEach((m, mi) => {
            const pos = at + m.recordOffset, w = h.writes.find(w => w.mi === mi);
            words[pos] = w?.offset ?? NO_WRITE;
            if (w) { words.set(w.old, pos + 1); words.set(w.data, pos + 1 + m.width); }
        });
        words.set(layout.probePins.map(pin => sim.values[pin]), at + layout.sampleOffset); wave.capture(sim);
    }
    words.set(sim.values, 8);
    return { words, wave };
}

test('resident ABI preserves exact topological gate, memory and probe layout', () => {
    const plan = make(), packed = packResidentPlan(plan, { probes: ['counter', 'data'] });
    assert.equal(packed.plan.fingerprint, plan.fingerprint);
    assert.equal(packed.memoryLayout[1].ramOffset, 2048);
    assert.equal(packed.ramWords, 2304);
    plan.order.forEach((index, n) => { const g = plan.gates[index];
        assert.deepEqual(Array.from(packed.data.slice(packed.gates + n * 5, packed.gates + n * 5 + 5)), [g.op, g.a, g.b, g.c, g.q]); });
    assert.deepEqual(packed.probePins, [...plan.outputs.counter, ...plan.outputs.data]);
});
test('resident journal decoder reproduces clock history, read-only RAM and sampled probes', () => {
    const packed = packResidentPlan(make(), { probes: ['counter', 'data'] }), reference = new DigitalSimulator(packed.plan);
    const { words, wave } = recorded(packed, reference, 12), decoded = decodeResidentResult(packed, words, 12, 0);
    assert.deepEqual(decoded.journals, reference.history); assert.deepEqual(decoded.samples, wave.samples);
    assert.deepEqual(decoded.values, reference.values);
    assert.equal(decoded.journals[4].writes.some(w => w.mi === 0), false);
});
test('resident decoder rejects forged headers, logic, addresses, read-only writes and incomplete records', () => {
    const layout = packResidentPlan(make(), { probes: ['counter'] }), { words } = recorded(layout, new DigitalSimulator(layout.plan), 8);
    const bad = mutate => { const copy = words.slice(); mutate(copy); assert.throws(() => decodeResidentResult(layout, copy, 8, 0)); };
    bad(w => w[0] = 9); bad(w => w[1] = 7); bad(w => w[2] = 0); bad(w => w[8] = 1); bad(w => w[11] = 4);
    bad(w => w[layout.recordsOffset] = 1); bad(w => w[layout.recordsOffset + layout.roots.length] = 1);
    bad(w => w[layout.recordsOffset + layout.roots.length] = 4 * 8);
    bad(w => w[layout.recordsOffset + layout.roots.length + 1] = 7);
    bad(w => w[layout.recordsOffset + layout.sampleOffset] = 4);
    assert.throws(() => decodeResidentResult(layout, words.slice(1), 8, 0));
    assert.throws(() => decodeResidentResult(layout, words, 8, Number.MAX_SAFE_INTEGER));
    for (let reason = 3; reason <= 6; reason++) bad(w => w[1] = reason);
});
test('resident plan bounds probes, journal capacity and cyclic circuits before GPU allocation', () => {
    const plan = make();
    assert.throws(() => packResidentPlan(plan, { probes: ['no'] }), /Unknown/);
    assert.throws(() => packResidentPlan(plan, { probes: ['counter', 'counter'] }), /distinct/);
    assert.throws(() => packResidentPlan(plan, { maxBatch: 0 }), /budget/);
    assert.throws(() => packResidentPlan(plan, { maxJournalBytes: 4 }), /one clock/);
    const b = new NetlistBuilder(), q = b.wire('feedback', 0); b.drive(q, Gate.NOT, q);
    assert.throws(() => packResidentPlan(b.compile({ allowCycles: true })), /acyclic/);
});
test('mirror revisions change on host input, memory, clock, reverse and snapshot restoration', () => {
    const s = new DigitalSimulator(make()); const check = op => { const before = s.revision; op(); assert.ok(s.revision > before); };
    check(() => s.input('write', 1)); check(() => s.poke('first', 0, 42)); check(() => s.clock());
    check(() => s.back()); check(() => s.restore(s.snapshot())); check(() => s.reset()); check(() => s.settle());
});
test('resident GPU request reports adapter absence and invalid construction explicitly', async () => {
    const s = new DigitalSimulator(make());
    await assert.rejects(GPUResidentSimulator.create(s, { gpu: null }), /unavailable/);
    await assert.rejects(GPUResidentSimulator.create(s, { gpu: { requestAdapter: async () => null } }), /adapter/);
    assert.throws(() => new GPUResidentSimulator({ plan:s.plan }, {}), /versioned/);
});
test('resident WGSL uses a single cooperating workgroup and uniform barrier decisions', () => {
    const text = residentShader(packResidentPlan(make()));
    assert.match(text, /@workgroup_size\(64\)/); assert.match(text, /workgroupUniformLoad\(&reason\)/);
    assert.match(text, /storageBarrier\(\)/); assert.match(text, /wires\[WIRES\+i\]/);
    assert.doesNotMatch(text, /diagnostic\(off|subgroup|global_invocation/);
});
