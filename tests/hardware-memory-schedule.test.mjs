import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetlistBuilder } from '../packages/hardware-sim/netlist.js';
import { DigitalSimulator } from '../packages/hardware-sim/digital.js';
import { Gate, ARITY, logicGate } from '../packages/hardware-sim/logic.js';
import { memorySchedule } from '../packages/hardware-sim/memory-schedule.js';

function fixture() {
    const b = new NetlistBuilder('RAM boundary fixture'), input = b.input('address', 4), data = b.input('data', 8);
    const address = b.add(input, b.constant(1, 4)).sum;
    const first = b.ram('one', { width: 8, depth: 16, address, data, write: b.zero });
    const second = b.ram('two', { width: 8, depth: 16, address: b.bits(Gate.NOT, input), data: first, write: b.zero });
    b.output('result', b.bits(Gate.XOR, first, second));
    b.output('independent', b.add(data, b.constant(7, 8)).sum);
    b.output('address', address);
    return b.compile();
}
function settled(sim, schedule) {
    const values = sim.values.slice();
    const evaluate = (start, end) => {
        for (let i = start; i < end; i++) for (const index of schedule.levels[i]) {
            const g = sim.plan.gates[index]; values[g.q] = logicGate(g.op, values[g.a], values[g.b], values[g.c]);
        }
    };
    evaluate(0, schedule.readBoundary);
    for (const memory of sim.memories) {
        let address = 0, known = true;
        memory.address.forEach((pin, bit) => { address += (values[pin] & 1) * 2 ** bit; known &&= values[pin] < 2; });
        memory.read.forEach((pin, bit) => { values[pin] = known && address < memory.depth ? memory.values[address * memory.width + bit] : 2; });
    }
    evaluate(schedule.readBoundary, schedule.levels.length);
    return values;
}
test('RAM partition contains every gate exactly once and closes all address dependencies', () => {
    const plan = fixture(), schedule = memorySchedule(plan), available = new Set();
    const driven = new Set(plan.gates.map(g => g.q)), reads = new Set(plan.memories.flatMap(m => m.read));
    plan.names.forEach((_name, pin) => { if (!driven.has(pin) && !reads.has(pin)) available.add(pin); });
    for (let i = 0; i <= schedule.levels.length; i++) {
        if (i === schedule.readBoundary) {
            for (const m of plan.memories) for (const pin of m.address) assert.ok(available.has(pin));
            for (const pin of reads) available.add(pin);
        }
        const level = schedule.levels[i] ?? [];
        for (const index of level) {
            const g = plan.gates[index];
            for (const pin of [g.a, g.b, g.c].slice(0, ARITY[g.op])) assert.ok(available.has(pin), `gate ${index} reads unavailable pin ${pin}`);
        }
        for (const index of level) available.add(plan.gates[index].q);
    }
    assert.equal(new Set(schedule.order).size, plan.gates.length);
    assert.equal(schedule.order.length, plan.gates.length);
    assert.equal(schedule.beforeGates + schedule.afterGates, plan.gates.length);
    assert.ok(schedule.beforeGates > 0); assert.ok(schedule.afterGates > 0);
});
test('one-pass RAM partition equals CPU dirty propagation with X/Z address and data stimuli', () => {
    const sim = new DigitalSimulator(fixture()), schedule = memorySchedule(sim.plan);
    for (let address = 0; address < 16; address++) { sim.poke('one', address, address * 17); sim.poke('two', address, 255 - address * 13); }
    for (let iteration = 0; iteration < 80; iteration++) {
        sim.plan.inputs.address.forEach((pin, bit) => { sim.values[pin] = iteration < 16 ? iteration >> bit & 1 : (iteration + bit * 3) % 4; });
        sim.plan.inputs.data.forEach((pin, bit) => { sim.values[pin] = (iteration + bit) % 4; });
        const expected = settled(sim, schedule); sim.settle(); assert.deepEqual(expected, sim.values);
    }
});
test('no-RAM and root-address RAM plans handle an empty pre-read schedule', () => {
    for (const withMemory of [false, true]) {
        const b = new NetlistBuilder(), input = b.input('a', 4); b.output('inv', b.bits(Gate.NOT, input));
        if (withMemory) b.ram('r', { width: 1, depth: 16, address: input, data: [b.one], write: b.zero });
        const sim = new DigitalSimulator(b.compile()), schedule = memorySchedule(sim.plan);
        assert.equal(schedule.readBoundary, 0); assert.deepEqual(settled(sim, schedule), sim.values);
    }
});
test('unused unary pins cannot introduce false memory-address dependencies', () => {
    const b = new NetlistBuilder(), input = b.input('a'), address = b.wire('address');
    const read = b.ram('r', { width: 1, depth: 2, address: [address], data: [b.one], write: b.zero });
    b.drive(address, Gate.NOT, input[0], read[0]); b.output('q', read);
    const schedule = memorySchedule(b.compile()); assert.equal(schedule.beforeGates, 1);
});
test('RAM schedule rejects a combinational cycle and an address/read feedback loop', () => {
    const b = new NetlistBuilder(), pin = b.wire(); b.drive(pin, Gate.NOT, pin);
    assert.throws(() => memorySchedule(b.compile({ allowCycles: true })), /acyclic/);
    const plan = fixture(); plan.memories[0].address[0] = plan.memories[1].read[0];
    assert.throws(() => memorySchedule(plan), /RAM address/);
});
