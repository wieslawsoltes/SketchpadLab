/** TX-2 arithmetic element, instruction-level (not gate/cycle accurate).
 * Nov. 1963 Users Handbook §§3-2.4–3-2.7. In particular AB is NOT a pair
 * of independently signed words: MUL doubles its integer product before
 * placing it into AB and duplicates the sign in AB's least significant bit.
 */
import { describeConfiguration, subwords, exchangeLoad } from './exchange.js';
import { word, maskFor, signBit, isNegative, toSigned, fromSigned, arithmeticResult, addOnes, subtractOnes, quarter, putQuarter, rotate } from './word.js';
import { MachineFault } from './memory.js';
export function activeSubwords(configuration) {
    const c = describeConfiguration(configuration);
    return subwords(c.fracture).filter(s => c.activity & (((1 << (s.bits / 9)) - 1) << (s.offset / 9)));
}
export function activeWordMask(configuration, quartersOnly = false) {
    const c = describeConfiguration(configuration);
    if (quartersOnly) {
        let mask = 0n;
        for (let q = 0; q < 4; q++)
            if (c.activity & (1 << q))
                mask |= 511n << BigInt(q * 9);
        return mask;
    }
    return activeSubwords(configuration).reduce((m, s) => m | (maskFor(s.bits) << BigInt(s.offset)), 0n);
}
/** Carry OUT of each bit column, including the end-around carry. Two passes
 * resolve the single ring carry; all-propagate cancellation chooses -0. */
export function addWithCarries(a, b, bits = 36, subtract = false) {
    const mask = maskFor(bits), x = a & mask, y = subtract ? mask ^ (b & mask) : b & mask;
    let carry = (x + y) > mask ? 1n : 0n, carries = 0n;
    for (let bit = 0; bit < bits; bit++) {
        const shift = BigInt(bit), ax = (x >> shift) & 1n, bx = (y >> shift) & 1n;
        carry = (ax & bx) | ((ax ^ bx) & carry);
        carries |= carry << shift;
    }
    return { ...arithmeticResult(x, b, bits, subtract), carries };
}
function part(value, s) { return (value >> BigInt(s.offset)) & maskFor(s.bits); }
function replace(value, s, v) {
    const shift = BigInt(s.offset), mask = maskFor(s.bits);
    return word((value & ~(mask << shift)) | ((v & mask) << shift));
}
function scaleOne(value, bits, right) {
    const mask = maskFor(bits), sign = value & signBit(bits), low = mask >> 1n;
    return right ? sign | ((value >> 1n) & low)
        : sign | (((value << 1n) | (sign ? 1n : 0n)) & low);
}
function scaled(value, bits, count, overflow = false) {
    // A zero-distance operation with a pending overflow uses implementation-
    // dependent AE stepping; reject that case until validated against circuitry.
    if (overflow && count === 0)
        throw new MachineFault('UNIMPLEMENTED', 'Zero-distance SCALE with pending overflow is not yet verified');
    let v = value;
    for (let n = 0; n < Math.abs(count); n++) {
        v = scaleOne(v, bits, count < 0);
        if (overflow && n === 0)
            v ^= signBit(bits);
    }
    return v;
}
/** Pure state transition. Input registers are never mutated, permitting atomic
 * fault rollback and property/differential testing without a live machine. */
export function arithmeticElement(op, configuration, operand, registers, overflowFlags = 0) {
    const groups = activeSubwords(configuration), c = describeConfiguration(configuration);
    const r = { A: word(registers.A), B: word(registers.B), C: word(registers.C),
        D: word(registers.D), E: word(operand), overflowFlags };
    const originalD = r.D, loadedD = exchangeLoad(configuration, operand, originalD);
    const loaded = exchangeLoad(configuration, operand, 0n);
    if (['MUL', 'DIV', 'NOA', 'NAB', 'TLY'].includes(op) && c.fracture === 2 && groups.length > 1)
        throw new MachineFault('UNIMPLEMENTED', `${op}: simultaneous active 27/9 subwords require the coupled hardware step counter`);
    for (const s of groups) {
        const mask = maskFor(s.bits), a = part(r.A, s), b = part(r.B, s), d = part(loaded, s);
        const signQuarter = (s.offset + s.bits) / 9 - 1, z = 1 << signQuarter;
        if (op === 'ADD' || op === 'SUB') {
            const sum = addWithCarries(a, d, s.bits, op === 'SUB');
            r.A = replace(r.A, s, sum.value);
            r.C = replace(r.C, s, sum.carries);
            r.D = replace(r.D, s, part(loadedD, s));
            r.overflowFlags = (r.overflowFlags & ~z) | (sum.overflow ? z : 0);
        }
        else if (['CYA', 'CYB', 'CAB', 'SCA', 'SCB', 'SAB', 'NOA', 'NAB'].includes(op)) {
            const double = ['CAB', 'SAB', 'NAB'].includes(op), useB = ['CYB', 'SCB'].includes(op);
            const bits = s.bits * (double ? 2 : 1), initial = double ? (a << BigInt(s.bits)) | b : useB ? b : a;
            let count = Number(toSigned(BigInt(quarter(loadedD, signQuarter)), 9)), result;
            if (op === 'NOA' || op === 'NAB') {
                let steps = 0;
                if (r.overflowFlags & z) {
                    result = scaled(initial, bits, -1, true);
                    steps = -1;
                }
                else {
                    result = initial;
                    const sign = !!(initial & signBit(bits));
                    // At most width-1 left shifts. All-sign words retain their
                    // original zero sign throughout normalization.
                    while (steps < bits - 1 && !!(result & signBit(bits - 1)) === sign) {
                        result = scaleOne(result, bits, false);
                        steps++;
                    }
                }
                r.D = replace(r.D, s, part(loadedD, s));
                r.D = putQuarter(r.D, signQuarter, subtractOnes(BigInt(quarter(loadedD, signQuarter)), fromSigned(steps, 9), 9));
                r.overflowFlags &= ~z;
            }
            else {
                const cycle = op.startsWith('CY') || op === 'CAB';
                result = cycle ? rotate(initial, count, bits)
                    : scaled(initial, bits, count, !useB && !!(r.overflowFlags & z));
                r.D = replace(r.D, s, part(loadedD, s));
                r.D = putQuarter(r.D, signQuarter, 511);
                if (!cycle && !useB)
                    r.overflowFlags &= ~z;
            }
            if (double) {
                r.A = replace(r.A, s, result >> BigInt(s.bits));
                r.B = replace(r.B, s, result & mask);
            }
            else if (useB)
                r.B = replace(r.B, s, result);
            else
                r.A = replace(r.A, s, result);
        }
        else if (op === 'MUL' || op === 'DIV') {
            let top, bottom, overflow = false;
            if (op === 'MUL') {
                const product = toSigned(a, s.bits) * toSigned(d, s.bits);
                const negativeZero = isNegative(a, s.bits) !== isNegative(d, s.bits);
                const double = fromSigned(product * 2n, s.bits * 2, negativeZero);
                top = double >> BigInt(s.bits);
                bottom = double & mask;
            }
            else {
                const packed = ((a << BigInt(s.bits)) | b) >> 1n;
                const numerator = toSigned(packed, 2 * s.bits - 1), denominator = toSigned(d, s.bits);
                if (denominator === 0n)
                    throw new MachineFault('UNIMPLEMENTED', 'DIV by either zero: the hardware overflow result has not been validated');
                const q = numerator / denominator, rem = numerator % denominator, magnitude = q < 0n ? -q : q;
                if (magnitude > mask)
                    throw new MachineFault('UNIMPLEMENTED', 'DIV irrecoverable overflow: hardware residue is not synthesized');
                overflow = magnitude > (mask >> 1n);
                const negative = isNegative(a, s.bits) !== isNegative(d, s.bits);
                top = negative ? mask ^ magnitude : magnitude;
                bottom = fromSigned(rem, s.bits, isNegative(a, s.bits));
            }
            r.A = replace(r.A, s, top);
            r.B = replace(r.B, s, bottom);
            r.C = replace(r.C, s, 0n);
            r.D = replace(r.D, s, part(loadedD, s));
            r.overflowFlags = (r.overflowFlags & ~z) | (overflow ? z : 0);
        }
        else if (op === 'TLY') {
            let v = d, n = 0n;
            while (v) {
                v &= v - 1n;
                n++;
            }
            r.A = replace(r.A, s, d);
            r.D = putQuarter(r.D, signQuarter, addOnes(BigInt(quarter(originalD, signQuarter)), n, 9));
        }
        else
            throw new TypeError(`Not an arithmetic-element operation: ${op}`);
    }
    return r;
}
