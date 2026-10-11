import { word, checkedAddress, parity, formatOctal } from './word.js';
import { PLUGBOARD_WORDS, PLUGBOARD_BASE } from './boot.js';
export const REGISTERS = Object.freeze({ A: 0o377604, B: 0o377605, C: 0o377606, D: 0o377607, E: 0o377610 });
const REGISTER_SET = new Set(Object.values(REGISTERS));
export class MachineFault extends Error {
    constructor(code, message, details = {}) { super(message); this.name = 'MachineFault'; this.code = code; this.details = details; }
}
/** STUV with mapped A–E, independent data/metabit/parity planes and a write journal.
 * Unknown V-memory is deliberately not silently fabricated. */
export class Memory {
    constructor({ withU = true } = {}) {
        this.withU = withU;
        this.data = new BigUint64Array(1 << 17);
        this.meta = new Uint8Array(1 << 17);
        this.parityBits = new Uint8Array(1 << 17);
        this.readHooks = new Map();
        this.writeHooks = new Map();
        this.transaction = null;
        this.onAccess = null;
        PLUGBOARD_WORDS.forEach((v, i) => this.poke(PLUGBOARD_BASE + i, v));
    }
    mapped(a) { return a <= 0o207777 || (this.withU && a >= 0o210000 && a <= 0o217777) || REGISTER_SET.has(a) || this.readHooks.has(a) || (a >= 0o377740 && a <= 0o377777); }
    address(a) {
        a = checkedAddress(a);
        if (!this.mapped(a))
            throw new MachineFault('QSAL', `Unmapped memory ${formatOctal(a, 6)}`, { address: a });
        return a;
    }
    metaAddress(a) { return REGISTER_SET.has(a) ? REGISTERS.A : a; }
    peek(a) { a = this.address(a); return this.readHooks.has(a) ? word(this.readHooks.get(a)()) : this.data[a]; }
    read(a, kind = 'read', phase = kind === 'execute' ? 'execute' : 'operand') {
        a = this.address(a);
        const v = this.peek(a);
        if (!this.readHooks.has(a) && this.parityBits[a] !== parity(v))
            throw new MachineFault('PARITY', `Parity mismatch at ${formatOctal(a, 6)}`, { address: a });
        this.onAccess?.({ kind, phase, address: a, value: v, meta: this.getMeta(a) });
        return v;
    }
    remember(a) {
        if (this.transaction && !this.transaction.has(a))
            this.transaction.set(a, [this.data[a], this.meta[a], this.parityBits[a]]);
    }
    write(a, v, phase = 'operand') {
        a = this.address(a);
        v = word(v);
        this.onAccess?.({ kind: 'write', phase, address: a, value: v, meta: this.getMeta(a) });
        if (this.writeHooks.has(a)) {
            this.writeHooks.get(a)(v);
            return;
        }
        // The handbook inhibits V writes except to A–E.
        if (a >= 0o377600 && !REGISTER_SET.has(a))
            return;
        this.remember(a);
        this.data[a] = v;
        this.parityBits[a] = parity(v);
    }
    poke(a, v) { a = checkedAddress(a); this.remember(a); this.data[a] = word(v); this.parityBits[a] = parity(v); }
    getMeta(a) { a = this.address(a); return this.meta[this.metaAddress(a)] !== 0; }
    setMeta(a, b) {
        a = this.address(a);
        if (a >= 0o377600 && !REGISTER_SET.has(a))
            return;
        const m = this.metaAddress(a);
        this.remember(m);
        this.meta[m] = b ? 1 : 0;
    }
    begin() {
        if (this.transaction)
            throw new Error('Nested memory transaction');
        this.transaction = new Map();
    }
    commit() { const delta = this.transaction ?? new Map(); this.transaction = null; return [...delta]; }
    rollback(delta = null) {
        const entries = delta ?? [...(this.transaction ?? new Map())];
        this.transaction = null;
        for (const [a, [v, m, p]] of entries) {
            this.data[a] = v;
            this.meta[a] = m;
            this.parityBits[a] = p;
        }
    }
    injectParityError(a) { a = this.address(a); this.parityBits[a] ^= 1; }
    mapRead(a, fn) {
        a = checkedAddress(a);
        if (typeof fn !== 'function')
            throw new TypeError('Read hook must be a function');
        this.readHooks.set(a, fn);
    }
    snapshot() { return { data: this.data.slice(), meta: this.meta.slice(), parityBits: this.parityBits.slice() }; }
    restore(s) {
        if (!(s?.data instanceof BigUint64Array) || !(s.meta instanceof Uint8Array) || !(s.parityBits instanceof Uint8Array) || s.data.length !== this.data.length || s.meta.length !== this.meta.length || s.parityBits.length !== this.parityBits.length)
            throw new RangeError('Invalid memory snapshot');
        this.data.set(s.data);
        this.meta.set(s.meta);
        this.parityBits.set(s.parityBits);
    }
}
