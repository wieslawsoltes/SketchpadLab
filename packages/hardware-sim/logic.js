/** Four-state digital logic. These are logical states, not measured voltages. */
export const Logic = Object.freeze({ LOW: 0, HIGH: 1, X: 2, Z: 3 });
export const Gate = Object.freeze({ BUF: 0, NOT: 1, AND: 2, OR: 3, XOR: 4,
    NAND: 5, NOR: 6, XNOR: 7, MUX: 8, TRI: 9, RESOLVE: 10 });
export const GATE_NAMES = Object.freeze(Object.keys(Gate));
export const ARITY = Object.freeze([1, 1, 2, 2, 2, 2, 2, 2, 3, 2, 2]);
export function logicValue(value) {
    if (!Number.isInteger(value) || value < 0 || value > 3) throw new RangeError('Logic value must be 0, 1, X (2), or Z (3)');
    return value;
}
function evaluate(op, a, b, c) {
    const known = x => x < 2, inv = x => known(x) ? x ^ 1 : 2;
    const and = (x, y) => x === 0 || y === 0 ? 0 : x === 1 && y === 1 ? 1 : 2;
    const or = (x, y) => x === 1 || y === 1 ? 1 : x === 0 && y === 0 ? 0 : 2;
    switch (op) {
        case Gate.BUF: return a === 3 ? 2 : a;
        case Gate.NOT: return inv(a);
        case Gate.AND: return and(a, b);
        case Gate.OR: return or(a, b);
        case Gate.XOR: return known(a) && known(b) ? a ^ b : 2;
        case Gate.NAND: return inv(and(a, b));
        case Gate.NOR: return inv(or(a, b));
        case Gate.XNOR: return inv(known(a) && known(b) ? a ^ b : 2);
        case Gate.MUX: return c === 0 ? a : c === 1 ? b : a === b ? a : 2;
        case Gate.TRI: return b === 0 ? 3 : b === 1 ? a : a === 3 ? 3 : 2;
        case Gate.RESOLVE: return a === 3 ? b : b === 3 ? a : a === b ? a : 2;
        default: throw new RangeError('Unknown gate');
    }
}
/** Same lookup table is uploaded to WebGPU; unknowns are never coerced to zero. */
export const TRUTH_TABLE = Uint32Array.from({ length: GATE_NAMES.length * 64 }, (_, n) =>
    evaluate(n >>> 6, n & 3, (n >>> 2) & 3, (n >>> 4) & 3));
export const logicGate = (op, a, b = 0, c = 0) => {
    if (!Number.isInteger(op) || op < 0 || op >= GATE_NAMES.length) throw new RangeError('Unknown gate');
    return TRUTH_TABLE[op * 64 + logicValue(a) + 4 * logicValue(b) + 16 * logicValue(c)];
};
export class UnknownSignalError extends Error {
    constructor(name) { super(`Signal ${name} contains X or Z`); this.name = 'UnknownSignalError'; }
}
export function readBus(values, bus, name = 'bus') {
    let result = 0n;
    for (let i = bus.length - 1; i >= 0; i--) {
        const bit = values[bus[i]];
        if (bit > 1) throw new UnknownSignalError(name);
        result = (result << 1n) | BigInt(bit);
    }
    return result;
}
export function writeBus(values, bus, value) {
    value = BigInt(value);
    if (value < 0n || value >= 1n << BigInt(bus.length)) throw new RangeError('Bus value is out of range');
    for (let i = 0; i < bus.length; i++) values[bus[i]] = Number((value >> BigInt(i)) & 1n);
}
