import { word, formatOctal } from './word.js';
// TX-2 Users Handbook (1963). Opcode 044/JZA is deliberately not inferred from the inconsistent 1961 index.
export const OPCODES = Object.freeze({
    OPR: 0o04, JMP: 0o05, JPX: 0o06, JNX: 0o07, AUX: 0o10, RSX: 0o11, SKX: 0o12, EXX: 0o14, ADX: 0o15, DPX: 0o16, SKM: 0o17,
    LDE: 0o20, SPF: 0o21, SPG: 0o22, LDA: 0o24, LDB: 0o25, LDC: 0o26, LDD: 0o27,
    STE: 0o30, FLF: 0o31, FLG: 0o32, STA: 0o34, STB: 0o35, STC: 0o36, STD: 0o37,
    ITE: 0o40, ITA: 0o41, UNA: 0o42, SED: 0o43, JOV: 0o45, JPA: 0o46, JNA: 0o47,
    EXA: 0o54, INS: 0o55, COM: 0o56, TSD: 0o57, CYA: 0o60, CYB: 0o61, CAB: 0o62,
    NOA: 0o64, DSA: 0o65, NAB: 0o66, ADD: 0o67, SCA: 0o70, SCB: 0o71, SAB: 0o72, TLY: 0o74, DIV: 0o75, MUL: 0o76, SUB: 0o77
});
export const NAMES = Object.freeze(Object.fromEntries(Object.entries(OPCODES).map(([k, v]) => [v, k])));
export const IMPLICIT_HOLD = new Set(['LDE', 'ITE', 'JPX', 'JNX']);
export const ALIASES = Object.freeze({
    IOS: { op: 'OPR' }, AOP: { op: 'OPR', forceOperand: 0o100000 },
    BRC: { op: 'JMP', config: 0o01 },
    JPS: { op: 'JMP', config: 0o02 },
    BRS: { op: 'JMP', config: 0o03 },
    JPQ: { op: 'JMP', config: 0o14 },
    BPQ: { op: 'JMP', config: 0o15 },
    JES: { op: 'JMP', config: 0o16 },
    JPD: { op: 'JMP', config: 0o20 },
    BRD: { op: 'JMP', config: 0o21 },
    JDS: { op: 'JMP', config: 0o22 },
    BDS: { op: 'JMP', config: 0o23 },
    REX: { op: 'SKX', config: 0o00 },
    INX: { op: 'SKX', config: 0o02 },
    DEX: { op: 'SKX', config: 0o03 },
    SXD: { op: 'SKX', config: 0o04 },
    SXL: { op: 'SKX', config: 0o06 },
    SXG: { op: 'SKX', config: 0o07 },
    RXF: { op: 'SKX', config: 0o10 },
    RXD: { op: 'SKX', config: 0o20 },
    RFD: { op: 'SKX', config: 0o30 },
    SUC: { op: 'SKM', config: 0o11 },
    SUZ: { op: 'SKM', config: 0o12 },
    SUN: { op: 'SKM', config: 0o13 },
    SZC: { op: 'SKM', config: 0o21 },
    SZZ: { op: 'SKM', config: 0o22 },
    SZN: { op: 'SKM', config: 0o23 },
    SNC: { op: 'SKM', config: 0o31 },
    SNZ: { op: 'SKM', config: 0o32 },
    SNN: { op: 'SKM', config: 0o33 },
    MCR: { op: 'SKM', config: 0o05 },
    MZR: { op: 'SKM', config: 0o06 },
    MNR: { op: 'SKM', config: 0o07 },
    SUR: { op: 'SKM', config: 0o14 },
    SZR: { op: 'SKM', config: 0o24 },
    SNR: { op: 'SKM', config: 0o34 },
    MKZ: { op: 'SKM', config: 0o02 }, MKN: { op: 'SKM', config: 0o03 }, MKC: { op: 'SKM', config: 0o01 },
    SKZ: { op: 'SKM', config: 0o20 }, SKN: { op: 'SKM', config: 0o30 }, SKU: { op: 'SKM', config: 0o10 }, CYR: { op: 'SKM', config: 0o04 }
});
export function encodeInstruction({ op, config = 0, index = 0, address = 0, defer = false, hold }) {
    const alias = ALIASES[op];
    if (alias) {
        op = alias.op;
        config |= alias.config ?? 0;
        address |= alias.forceOperand ?? 0;
    }
    const opcode = typeof op === 'number' ? op : OPCODES[op];
    for (const [name, value, max] of [['opcode', opcode, 63], ['configuration', config, 31], ['index', index, 63], ['address', address, 0o377777]]) {
        if (!Number.isInteger(value) || value < 0 || value > max)
            throw new RangeError(`${name} is out of range: ${value}`);
    }
    const held = hold ?? IMPLICIT_HOLD.has(typeof op === 'string' ? op : NAMES[op]);
    return (BigInt(!!held) << 35n) | (BigInt(config) << 30n) | (BigInt(opcode) << 24n) | (BigInt(index) << 18n) | (BigInt(!!defer) << 17n) | BigInt(address);
}
export function decodeInstruction(value) {
    const v = word(value), opcode = Number((v >> 24n) & 63n);
    return { word: v, op: NAMES[opcode] ?? '???', opcode, hold: !!(v & (1n << 35n)), config: Number((v >> 30n) & 31n), index: Number((v >> 18n) & 63n), defer: !!(v & (1n << 17n)), address: Number(v & 131071n) };
}
export function disassemble(value) {
    const i = decodeInstruction(value);
    if (i.op === '???')
        return `.word 0o${formatOctal(i.word)}`;
    return `${i.hold ? 'h' : IMPLICIT_HOLD.has(i.op) ? 'u' : ''}${i.op}${i.config ? '^' + formatOctal(i.config, 2) : ''}${i.index ? '_' + formatOctal(i.index, 2) : ''} ${i.defer ? '*' : ''}${formatOctal(i.address, 6)}`;
}
export function decodeBitSelector(index) {
    const q = [3, 0, 1, 2][(index >> 4) & 3], bit = index & 15;
    return { quarter: q, bit, mask: bit >= 1 && bit <= 9 ? 1n << BigInt(q * 9 + bit - 1) : 0n, wordBit: bit >= 1 && bit <= 9 ? q * 9 + bit - 1 : null, meta: bit === 10, parity: bit === 11 || bit === 12 };
}
export function encodeBitSelector(quarterNumber, bitNumber) {
    if (!Number.isInteger(quarterNumber) || quarterNumber < 1 || quarterNumber > 4 || !Number.isInteger(bitNumber) || bitNumber < 0 || bitNumber > 15)
        throw new RangeError('Bit selector requires quarter 1..4, bit 0..15');
    return ((quarterNumber % 4) << 4) | bitNumber;
}
