import test from 'node:test';
import assert from 'node:assert/strict';
import { TX2, TrapCircuit, TRAP_MODES, encodeInstruction, WORD_MASK } from '../packages/tx2-core/index.js';
import { assembleM4 } from '../packages/tx2-assembler/index.js';
const make = (text, mode = 0) => {
    const image = assembleM4(text, { autoAssign: false });
    assert.deepEqual(image.diagnostics, []);
    const cpu = new TX2({ profile: 'tx2-io-research' }); cpu.load(image);
    cpu.io.connect(0o42, mode, 0); return cpu;
};
for (const [phase, detect, mark] of [['execute', 1, 0o100], ['defer', 2, 0o200], ['operand', 4, 0o400]]) {
    test(`TRAP ${phase}: mode decoding and old-metabit observation`, () => {
        const t = new TrapCircuit(); t.connect(detect | mark);
        assert.deepEqual(t.access(phase, false, 123, 0o60, 0), { mark: true, raise: false });
        assert.deepEqual(t.access(phase, true, 123, 0o60, 5), { mark: true, raise: true });
        assert.equal(t.count, 1); assert.equal(t.last.address, 123);
        t.markingDisabled = true;
        assert.deepEqual(t.access(phase, true, 123, 0o60, 10), { mark: false, raise: true });
        t.disconnect(); assert.equal(t.mode, detect | mark);
    });
}
test('TRAP rejects reserved mode bits without changing the active circuit', () => {
    const t = new TrapCircuit(); t.connect(0o711);
    for (const mode of [-1, 1.5, 0o20, 0o40, 0o1000]) assert.throws(() => t.connect(mode));
    assert.equal(t.mode, 0o711);
});
test('instruction/operand automatic marking is reversible and does not trap on freshly marked data', () => {
    const c = make('100|\nLDA 200\nSTA 201\n200|\n7\n0', 0o705);
    const initial = c.snapshot();
    assert(c.step().ok); assert(c.memory.getMeta(0o100)); assert(c.memory.getMeta(0o200));
    assert.equal(c.io.require(0o42).count, 0);
    assert(c.step().ok); assert(c.memory.getMeta(0o201));
    assert.equal(c.io.require(0o42).count, 0, 'read/modify/write must not trap on its own marking');
    c.back(); c.back(); const after = c.snapshot(); after.state.reason = initial.state.reason; assert.deepEqual(after, initial);
});
test('marked operand raises TRAP, switches to its handler and reports the prior sequence', () => {
    const c = make('100|\nLDA 200\n110|\nJPD #\n200|\n7', 4);
    c.K = 0o60; c.X[0o42] = 0o110n; c.raiseFlag(0o60); c.memory.setMeta(0o200, true);
    assert(c.step().ok);
    assert.equal(c.K, 0o42); assert.equal(c.P, 0o110); assert.equal(c.X[0o60], 0o101n);
    assert.equal(c.getRegister('A'), 7n);
    assert.equal(c.getRegister('E'), (0o60n << 27n) | (0o42n << 18n) | 0o101n);
    assert(c.step().ok); assert.equal(c.K, 0o60); assert.equal(c.P, 0o101);
});
test('instruction trap respects HOLD until an unheld instruction completes', () => {
    const c = make('100|\nhLDA 200\nSTA 201\n110|\nJPD #\n200|\n7\n0', 1);
    c.K = 0o60; c.X[0o42] = 0o110n; c.raiseFlag(0o60); c.memory.setMeta(0o100, true);
    assert(c.step().ok); assert.equal(c.K, 0o60); assert(c.flags & (1n << 0o42n));
    assert(c.step().ok); assert.equal(c.K, 0o42); assert.equal(c.memory.peek(0o201), 7n);
});
test('deferred-address trap marks only deferred words when requested', () => {
    const c = make('100|\nLDA 200*\n200|\n201\n7', 0o202);
    c.memory.setMeta(0o200, true); assert(c.step().ok);
    const trap = c.io.require(0o42); assert.equal(trap.count, 1); assert.equal(trap.last.phase, 'defer');
    assert(!c.memory.getMeta(0o201)); assert(!c.memory.getMeta(0o100));
    assert.equal(c.getRegister('A'), 7n);
});
test('TRAP mutations roll back with a failed instruction', () => {
    const c = make('100|\n0', 0o101); c.memory.setMeta(0o100, true);
    const before = c.snapshot(); assert.equal(c.step().ok, false);
    assert.deepEqual(c.snapshot().memory, before.memory); assert.equal(c.io.require(0o42).count, 0);
    assert.equal(c.flags, 0n); assert.equal(c.P, 0o100);
});
test('debugger reads and writes do not trigger instruction traps', () => {
    const c = make('100|\nLDA 200\n200|\n7', 0o707);
    c.memory.read(0o100); c.memory.write(0o200, 9n); c.setRegister('A', 3n);
    assert(!c.memory.getMeta(0o100)); assert(!c.memory.getMeta(0o200));
    assert.equal(c.io.require(0o42).count, 0);
});
test('SKM tests pre-reference metabit, not the automatic mark it just applied', () => {
    const c = make('100|\nSKN₄.₁₀ 200\n200|\n0', 0o400);
    assert(c.step().ok); assert.equal(c.P, 0o101); assert(c.memory.getMeta(0o200));
});
test('marked placekeeper is valid without a sequence trap mode', () => {
    const c = make('100|\nRFD₆₀ 400200'); assert(c.step().ok);
    assert.equal(c.K, 0o60); assert.equal(c.P, 0o400200);
    assert.equal(c.getRegister('E'), (0o60n << 18n) | 0o101n);
});
test('marked sequence change redirects to 42 with the intended target in E', () => {
    const c = make('100|\nRFD₆₀ 400200\n110|\nJPD #\n200|\nLDA 300\n300|\n7', 0o10);
    c.X[0o42] = 0o110n;
    assert(c.step().ok); assert.equal(c.K, 0o42); assert.equal(c.P, 0o110);
    assert.equal(c.X[0o60], 0o400200n);
    assert.equal(c.getRegister('E'), (0o60n << 18n) | 0o101n);
    assert.equal(c.io.require(0o42).last.phase, 'sequence');
    assert(c.step().ok); assert.equal(c.K, 0o60); assert.equal(c.P, 0o400200);
    assert(c.step().ok); assert.equal(c.P, 0o400201); assert.equal(c.getRegister('A'), 7n);
});
test('sequence trap does not intercept 0, 40, 41, 42 or return from 42', () => {
    const t = new TrapCircuit(); t.connect(0o10);
    for (const next of [0, 0o40, 0o41, 0o42]) assert(!t.intercept(0o60, next, 0o400100n, 0));
    assert(!t.intercept(0o42, 0o60, 0o400100n, 0));
    assert(!t.intercept(0o60, 0o55, 0o100n, 0));
    assert(t.intercept(0o60, 0o55, 0o400100n, 0));
});
test('P mark survives increment, skip, indexed jump and wrap-around', () => {
    const c = make('100|\nSKU 200\n0\nJMP 100\n200|\n0'); c.P |= 0o400000;
    assert(c.step().ok); assert.equal(c.P, 0o400102);
    assert(c.step().ok); assert.equal(c.P, 0o400100);
    c.P = 0o777777; c.advanceP(1); assert.equal(c.P, 0o400000);
    c.advanceP(-1); assert.equal(c.P, 0o777777);
});
test('TRAP TSD performs its cycle-and-dismiss behavior without a fabricated buffer', () => {
    const c = make('100|\nhTSD 200\n200|\n400000000001'); c.K = 0o42;
    assert(c.step().ok); assert.equal(c.memory.peek(0o200), 3n); assert.equal(c.K, 0o42);
    assert(c.back()); assert.equal(c.memory.peek(0o200), 0o400000000001n);
});
test('IOS reports TRAP mode before replacement; disconnect preserves mode', () => {
    const c = make('100|\n¹IOS₄₂ 30717\n¹IOS₄₂ 20000', 0o10);
    assert(c.step().ok); assert.equal(c.getRegister('E') & 0o7777n, 0o10n);
    assert(c.step().ok); assert.equal(c.getRegister('E') & 0o7777n, 0o717n);
    assert.equal(c.io.require(0o42).mode, 0o717);
});
