import test from 'node:test';
import assert from 'node:assert/strict';
import { TX2 } from '../packages/tx2-core/index.js';
import { assemble } from '../packages/tx2-assembler/index.js';

function fixture(source) {
    const image = assemble(source);
    assert.deepEqual(image.diagnostics, []);
    const machine = new TX2({ profile: 'tx2-io-research' });
    machine.load(image);
    machine.K = 0o60;
    machine.raiseFlag(0o60);
    machine.X[0o55] = 0o110n;
    return machine;
}

test('external high-priority flag preempts before an unheld next fetch and reverses atomically', () => {
    const c = fixture('.org 100\nLDA 200\nLDA 201\n.org 110\nhLDB 202\n.org 200\n.word 1\n.word 2\n.word 3');
    assert(c.step().ok); assert.equal(c.P, 0o101);
    c.raiseFlag(0o55);
    const before = c.snapshot();
    const step = c.step();
    assert(step.ok); assert.equal(step.pc, 0o110);
    assert.equal(c.getRegister('A'), 1n, 'old sequence must not execute LDA 201');
    assert.equal(c.getRegister('B'), 3n);
    assert.equal(c.X[0o60], 0o101n);
    assert.equal(c.K, 0o55);
    c.back();
    const reversed = c.snapshot(); reversed.state.reason = before.state.reason;
    assert.deepEqual(reversed, before);
});

test('external flags cannot preempt the instruction following HOLD', () => {
    const c = fixture('.org 100\nhLDA 200\nhLDA 201\nLDA 202\n.org 110\nhLDB 200\n.org 200\n.word 1\n.word 2\n.word 3');
    assert(c.step().ok); c.raiseFlag(0o55);
    const next = c.step(); assert(next.ok); assert.equal(next.pc, 0o101);
    assert.equal(c.K, 0o60); assert.equal(c.getRegister('A'), 2n);
    assert(c.step().ok); assert.equal(c.getRegister('A'), 3n);
    assert.equal(c.K, 0o55); assert.equal(c.P, 0o110);
});

for (const sequence of [0, 0o75, 0o76]) {
    test(`non-INOUT TSD in sequence ${sequence.toString(8)} cycles without requiring a peripheral`, () => {
        const c = fixture('.org 100\nhTSD 200\n.org 200\n.word 400000000001');
        c.K = sequence; c.flags = 0n; c.raiseFlag(sequence);
        assert(c.step().ok); assert.equal(c.memory.peek(0o200), 3n);
        assert(c.back()); assert.equal(c.memory.peek(0o200), 0o400000000001n);
    });
}

test('sequence 77 is not silently treated as a non-INOUT TSD channel', () => {
    const c = fixture('.org 100\nhTSD 200\n.org 200\n.word 1');
    c.K = 0o77; c.flags = 0n; c.raiseFlag(0o77);
    const result = c.step(); assert(!result.ok);
    assert.equal(c.memory.peek(0o200), 1n);
    assert.equal(c.cycles, 0);
});

test('Run honors a breakpoint at the asynchronously selected sequence before executing it', () => {
    const c = fixture('.org 100\nLDA 200\nLDA 201\n.org 110\nhLDB 202\n.org 200\n.word 1\n.word 2\n.word 3');
    assert(c.step().ok); c.raiseFlag(0o55); c.breakpoints.add(0o110);
    const before = c.snapshot();
    const run = c.run({ budget: 20, ignoreInitialBreakpoint: true });
    assert.equal(run.reason, 'breakpoint'); assert.equal(run.executed, 0);
    assert.equal(c.cycles, 1); assert.equal(c.P, 0o110); assert.equal(c.K, 0o55);
    assert.equal(c.getRegister('A'), 1n); assert.equal(c.getRegister('B'), 0n);
    assert.equal(c.history.at(-1).kind, 'boundary');
    assert.equal(c.trace.at(-1).kind, 'boundary');
    assert(c.back());
    const reversed = c.snapshot(); reversed.state.reason = before.state.reason; reversed.state.stopped = before.state.stopped;
    assert.deepEqual(reversed, before);
});

test('repeated stationary breakpoint checks do not append no-op history entries', () => {
    const c = fixture('.org 100\nLDA 200\n.org 200\n.word 7');
    c.breakpoints.add(0o100);
    for (let n = 0; n < 3; n++) {
        assert.equal(c.run({ budget: 1 }).reason, 'breakpoint');
        assert.equal(c.history.length, 0); assert.equal(c.cycles, 0);
    }
    assert(c.step().ok, 'single-step must still step through a breakpoint');
    assert.equal(c.getRegister('A'), 7n);
});

test('a device wakeup into a breakpoint records time and flag changes without an instruction', () => {
    const c = fixture('.org 100\nLDA 200\n.org 110\nhLDB 200\n.org 200\n.word 7');
    c.flags = 0n; c.K = 0; c.limbo = true; c.X[0o60] = 0o110n;
    const scope = c.io.require(0o60); scope.connect(0o30, 0); scope.ready = false; scope.readyAt = 100;
    c.breakpoints.add(0o110);
    assert.equal(c.run({ budget: 10 }).reason, 'breakpoint');
    assert.equal(c.virtualTime, 100); assert.equal(c.P, 0o110); assert.equal(c.K, 0o60);
    assert.equal(c.cycles, 0); assert.equal(c.getRegister('B'), 0n);
    assert.equal(c.history.at(-1).kind, 'boundary');
    assert(c.back()); assert.equal(c.virtualTime, 0); assert.equal(c.K, 0);
    assert(c.limbo); assert.equal(c.io.require(0o60).ready, false);
});
