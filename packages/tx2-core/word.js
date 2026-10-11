/** Exact bit operations. No 36-bit value is ever passed through JS's 32-bit bitwise operators. */
export const WORD_BITS = 36;
export const WORD_MASK = (1n << 36n) - 1n;
export const HALF_MASK = (1n << 18n) - 1n;
export const ADDRESS_MASK = 0o377777;
export const NEGATIVE_ZERO = WORD_MASK;
export const maskFor = bits => (1n << BigInt(bits)) - 1n;
export const word = value => BigInt(value) & WORD_MASK;
export const half = value => BigInt(value) & HALF_MASK;
export const signBit = bits => 1n << BigInt(bits - 1);
export const isNegative = (value, bits = 36) => (BigInt(value) & signBit(bits)) !== 0n;
export const isZero = (value, bits = 36) => { const x = BigInt(value) & maskFor(bits); return x === 0n || x === maskFor(bits); };
export function fromSigned(value, bits = 36, negativeZero = false) {
    const x = BigInt(value), m = maskFor(bits), limit = m >> 1n;
    if (x < -limit || x > limit)
        throw new RangeError(`${value} is outside signed ${bits}-bit one's-complement range`);
    return x < 0n ? m ^ -x : (x === 0n && negativeZero ? m : x);
}
export function toSigned(value, bits = 36) {
    const x = BigInt(value) & maskFor(bits);
    return isNegative(x, bits) ? -(maskFor(bits) ^ x) : x;
}
export function addOnes(a, b, bits = 36) {
    const m = maskFor(bits), n = BigInt(bits);
    let sum = (BigInt(a) & m) + (BigInt(b) & m);
    sum = (sum & m) + (sum >> n);
    return ((sum & m) + (sum >> n)) & m;
}
export const subtractOnes = (a, b, bits = 36) => addOnes(a, maskFor(bits) ^ (BigInt(b) & maskFor(bits)), bits);
export function arithmeticResult(a, b, bits = 36, subtract = false) {
    const m = maskFor(bits), rhs = subtract ? m ^ (BigInt(b) & m) : BigInt(b) & m;
    const value = addOnes(a, rhs, bits);
    const overflow = isNegative(a, bits) === isNegative(rhs, bits) && isNegative(a, bits) !== isNegative(value, bits);
    return { value, overflow };
}
export function rotate(value, count, bits = 36) {
    const m = maskFor(bits), n = BigInt(bits), k = BigInt(((Number(count) % bits) + bits) % bits);
    const x = BigInt(value) & m;
    return k === 0n ? x : ((x << k) | (x >> (n - k))) & m;
}
export const quarter = (value, index) => Number((BigInt(value) >> BigInt(index * 9)) & 511n);
export function putQuarter(value, index, q) {
    if (!Number.isInteger(index) || index < 0 || index > 3)
        throw new RangeError('Quarter index must be 0..3 (least significant first)');
    const shift = BigInt(index * 9), mask = 511n << shift;
    return (word(value) & ~mask) | ((BigInt(q) & 511n) << shift);
}
export const leftHalf = value => (BigInt(value) >> 18n) & HALF_MASK;
export const rightHalf = value => BigInt(value) & HALF_MASK;
export const joinHalves = (left, right) => (half(left) << 18n) | half(right);
export function formatOctal(value, digits = 12) { return BigInt(value).toString(8).padStart(digits, '0'); }
export function parseOctal(text, bits = 36) {
    const s = String(text).replace(/[_,\s]/g, '');
    if (!/^[0-7]+$/.test(s))
        throw new SyntaxError(`Invalid octal value: ${text}`);
    const n = BigInt(`0o${s}`);
    if (n > maskFor(bits))
        throw new RangeError(`Value does not fit in ${bits} bits`);
    return n;
}
export function parity(value) {
    let v = word(value), p = 0;
    while (v) {
        p ^= 1;
        v &= v - 1n;
    }
    return p;
}
export function checkedAddress(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > ADDRESS_MASK)
        throw new RangeError(`Invalid physical TX-2 address: ${value}`);
    return n;
}
/** The X adder uses signed one's-complement indices but canonicalizes address zero.
 * In particular, 000004 + 777773 (-4) addresses S[0], not V[377777].
 * The physical address wraps at 17 bits; defer/placeholder marks are handled by callers.
 * Technical Manual vol. 2, section 12-2; reference implementation: base/src/types.rs.
 */
export function indexAddress(address, index) {
    return Number((BigInt(checkedAddress(address)) + toSigned(index, 18)) & BigInt(ADDRESS_MASK));
}
export function encodeSixBitWords(words) {
    const out = new Uint8Array(words.length * 6);
    for (let i = 0; i < words.length; i++)
        for (let j = 0; j < 6; j++)
            out[i * 6 + j] = Number((word(words[i]) >> BigInt((5 - j) * 6)) & 63n);
    return out;
}
export function decodeSixBitWords(bytes) {
    if (bytes.length % 6)
        throw new RangeError('Raw six-bit transport must contain six frames per word; this is not a TX-2 boot-tape parser');
    const out = [];
    for (let i = 0; i < bytes.length; i += 6) {
        let value = 0n;
        for (let j = 0; j < 6; j++) {
            if (bytes[i + j] > 63)
                throw new RangeError(`Non-six-bit frame at ${i + j}`);
            value = (value << 6n) | BigInt(bytes[i + j]);
        }
        out.push(value);
    }
    return out;
}
