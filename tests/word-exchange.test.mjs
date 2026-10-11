import test from 'node:test';
import assert from 'node:assert/strict';
import * as w from '../packages/tx2-core/word.js';
import * as x from '../packages/tx2-core/exchange.js';
import { encodeInstruction, decodeInstruction, disassemble, OPCODES, encodeBitSelector, decodeBitSelector } from '../packages/tx2-core/instruction.js';
import { STANDARD_CONFIGURATION } from '../packages/tx2-core/standard-config.js';
import { assemble } from '../packages/tx2-assembler/index.js';
test('36-bit values retain their upper four bits', () => assert.equal(w.word(67317049134n), 67317049134n));
test('one’s complement preserves both zero bit patterns', () => { assert.equal(w.fromSigned(0, 36, true), w.WORD_MASK); assert(w.isZero(w.WORD_MASK)); assert.equal(w.toSigned(w.WORD_MASK), 0n); assert(w.isNegative(w.WORD_MASK)); });
test('signed conversion boundaries and range rejection', () => { for (const bits of [5, 9, 18, 36]) {
    const max = (1n << BigInt(bits - 1)) - 1n;
    for (const value of [-max, -1n, 0n, 1n, max])
        assert.equal(w.toSigned(w.fromSigned(value, bits), bits), value);
    assert.throws(() => w.fromSigned(max + 1n, bits), RangeError);
} });
test('end-around carry and negative-zero sum', () => { assert.equal(w.addOnes(w.WORD_MASK, 1n), 1n); assert.equal(w.addOnes(w.fromSigned(4), w.fromSigned(-4)), w.WORD_MASK); });
test('overflow is reported at signed range boundary', () => assert.equal(w.arithmeticResult((1n << 35n) - 1n, 1n).overflow, true));
test('address adder canonicalizes zero independently of arithmetic adder', () => { assert.equal(w.indexAddress(4, 262139n), 0); assert.equal(w.indexAddress(0, 262143n), 0); assert.equal(w.indexAddress(0, w.fromSigned(-1, 18)), 0o377777); assert.equal(w.indexAddress(0o377777, 1n), 0); });
test('signed address arithmetic agrees with wrapped integers for 20,000 cases', () => { let state = 1963; for (let i = 0; i < 20000; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const address = state & 0o377777;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const delta = (state % 262143) - 131071;
    assert.equal(w.indexAddress(address, w.fromSigned(delta, 18)), (address + delta) & 0o377777);
} });
test('rotate is reversible at all 36 rotations', () => { for (let i = 0; i < 36; i++)
    assert.equal(w.rotate(w.rotate(67317049134n, i), -i), 67317049134n); });
test('quarter insertion affects only its own nine bits', () => { for (let q = 0; q < 4; q++) {
    const value = w.putQuarter(0n, q, 0o777);
    assert.equal(w.quarter(value, q), 0o777);
    assert.equal(value, 511n << BigInt(q * 9));
} });
test('octal parser rejects non-octal and overflow', () => { assert.equal(w.parseOctal('765_432,123 456'), 67317049134n); assert.throws(() => w.parseOctal('8')); assert.throws(() => w.parseOctal('1000000000000')); });
test('six-bit raw transport round trips and rejects nonframes', () => { const values = [0n, w.WORD_MASK, 11219458257n]; assert.deepEqual(w.decodeSixBitWords(w.encodeSixBitWords(values)), values); assert.throws(() => w.decodeSixBitWords(new Uint8Array([1]))); assert.throws(() => w.decodeSixBitWords(new Uint8Array([64, 0, 0, 0, 0, 0]))); });
test('published boot instruction has exact numeric encoding', () => { assert.equal(encodeInstruction({ op: 'SPG', config: 4, address: 0o377741 }), 4597088225n); assert.equal(encodeInstruction({ op: 'JPX', hold: true, config: 0o36, index: 0o53, address: 0o377764 }), 66684059636n); });
test('all opcode/hold/configuration fields round trip through assembly', () => { for (const op of Object.keys(OPCODES))
    for (const hold of [false, true])
        for (const config of [0, 3, 31]) {
            const value = encodeInstruction({ op, hold, config, index: 63, address: 0o377777, defer: true });
            const image = assemble(disassemble(value));
            assert.deepEqual(image.diagnostics, [], disassemble(value));
            assert.equal(image.words[0][1], value, disassemble(value));
        } });
test('instruction decoder preserves independent bit fields', () => { const d = decodeInstruction(encodeInstruction({ op: 'LDA', config: 31, index: 63, address: 0o123456, defer: true, hold: true })); assert.equal(d.config, 31); assert.equal(d.index, 63); assert.equal(d.address, 0o123456); assert(d.defer && d.hold); });
test('bit selector uses decimal bit positions and permuted quarter indices', () => { for (let q = 1; q <= 4; q++)
    for (let b = 1; b <= 9; b++) {
        const selector = decodeBitSelector(encodeBitSelector(q, b));
        assert.equal(selector.wordBit, (q - 1) * 9 + b - 1);
        assert.equal(selector.mask, 1n << BigInt(selector.wordBit));
    } });
test('F memory comes from published plugboard constants', () => assert.deepEqual([...STANDARD_CONFIGURATION.slice(0, 8)], [0o000, 0o340, 0o342, 0o760, 0o761, 0o762, 0o763, 0o410]));
test('all eight fully active permutations invert on store', () => { const value = 39249060937n; for (let p = 0; p < 8; p++)
    assert.equal(x.exchangeStore(p, x.exchangeLoad(p, value)), value); });
test('all inactive quarters preserve the destination', () => { for (const f of [0, 1, 2, 3])
    assert.equal(x.exchangeLoad((f << 7) | (15 << 3), w.WORD_MASK, 11219495706n), 11219495706n); });
test('full-word partial activity sign extends positive and negative values', () => { assert.equal(x.signExtend(63217337345n, 0b0111, 0), 787457n); assert.equal(x.signExtend(25032393729n, 0b0111, 0), 68653155329n); assert.equal(x.signExtend(34897396922n, 0b1110, 0), 34897397247n); });
test('fracture prevents sign extension crossing half-word boundary', () => assert.equal(x.signExtend(9836429057n, 0b1101, 1), 9836429057n));
test('standard configuration 01 loads only the right half', () => assert.equal(x.exchangeLoad(STANDARD_CONFIGURATION[1], 9836279588n, 67317049134n), 67317118756n));
test('standard configuration 01 stores only the right half', () => assert.equal(x.exchangeStore(STANDARD_CONFIGURATION[1], 9836279588n, 67317049134n), 67317118756n));
test('configuration validation rejects out-of-range F values', () => { assert.throws(() => x.describeConfiguration(512)); assert.throws(() => x.describeConfiguration(-1)); });
