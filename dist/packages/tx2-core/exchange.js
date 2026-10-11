import { word, quarter, putQuarter, maskFor, arithmeticResult } from './word.js';
/** Exchange logic follows the documented permutation/activity/fracture fields.
 * Quarter indices are least-significant first. References and attribution: THIRD_PARTY_NOTICES.md. */
const LOAD_PERMUTATIONS = [[0, 1, 2, 3], [1, 2, 3, 0], [2, 3, 0, 1], [3, 0, 1, 2], [1, 0, 3, 2], [3, 2, 1, 0], [0, 3, 1, 2], [0, 2, 3, 1]];
const STORE_PERMUTATIONS = LOAD_PERMUTATIONS.map(p => p.map((_, i) => p.indexOf(i)));
export function describeConfiguration(value) {
    const v = Number(value);
    if (!Number.isInteger(v) || v < 0 || v > 511)
        throw new RangeError('F memory configuration must be nine bits');
    return { value: v, permutation: v & 7, activity: (~(v >> 3)) & 15, fracture: (v >> 7) & 3 };
}
export function subwords(fracture) { return [[{ offset: 0, bits: 36 }], [{ offset: 0, bits: 18 }, { offset: 18, bits: 18 }], [{ offset: 0, bits: 9 }, { offset: 9, bits: 27 }], [{ offset: 0, bits: 9 }, { offset: 9, bits: 9 }, { offset: 18, bits: 9 }, { offset: 27, bits: 9 }]][fracture]; }
export function signExtend(value, activity, fracture) {
    let result = word(value);
    const groups = subwords(fracture).map(s => Array.from({ length: s.bits / 9 }, (_, i) => s.offset / 9 + i));
    for (const group of groups) {
        const start = group.findIndex(q => activity & (1 << q));
        if (start < 0)
            continue;
        let sign = 0;
        for (let k = 0; k < group.length; k++) {
            const q = group[(start + k) % group.length];
            if (activity & (1 << q))
                sign = (quarter(result, q) & 0o400) ? 0o777 : 0;
            else
                result = putQuarter(result, q, sign);
        }
    }
    return result;
}
export function exchangeLoadWithoutSignExtension(configuration, memory, existing = 0n) {
    const c = describeConfiguration(configuration), permutation = LOAD_PERMUTATIONS[c.permutation];
    let result = word(existing);
    for (let q = 0; q < 4; q++)
        if (c.activity & (1 << q))
            result = putQuarter(result, q, quarter(memory, permutation[q]));
    return result;
}
export function exchangeLoad(configuration, memory, existing = 0n) {
    const c = describeConfiguration(configuration);
    return signExtend(exchangeLoadWithoutSignExtension(configuration, memory, existing), c.activity, c.fracture);
}
export function exchangeStore(configuration, register, existing = 0n) {
    const c = describeConfiguration(configuration), permutation = STORE_PERMUTATIONS[c.permutation];
    let result = word(existing);
    for (let q = 0; q < 4; q++) {
        const source = permutation[q];
        if (c.activity & (1 << source))
            result = putQuarter(result, q, quarter(register, source));
    }
    return result;
}
export function fracturedArithmetic(configuration, a, b, subtract = false) {
    const c = describeConfiguration(configuration);
    let result = word(a), overflow = false;
    for (const s of subwords(c.fracture)) {
        const qmask = ((1 << (s.bits / 9)) - 1) << (s.offset / 9);
        if (!(c.activity & qmask))
            continue;
        const shift = BigInt(s.offset), mask = maskFor(s.bits), r = arithmeticResult((a >> shift) & mask, (b >> shift) & mask, s.bits, subtract);
        result = (result & ~(mask << shift)) | (r.value << shift);
        overflow ||= r.overflow;
    }
    return { value: word(result), overflow };
}
// Filled from the published plugboard, not a synthetic sequential mapping. See standard-config.js.
