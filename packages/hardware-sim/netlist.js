import { Gate, ARITY, logicValue } from './logic.js';
const MAX_WIRES = 500000, MAX_MEMORY_BITS = 16 * 1024 * 1024;
const integer = (n, lo, hi, what) => {
    if (!Number.isSafeInteger(n) || n < lo || n > hi) throw new RangeError(`Invalid ${what}: ${n}`);
    return n;
};
/** Structural elaborator. Bus arrays are least-significant-bit first. */
export class NetlistBuilder {
    constructor(name = 'circuit') {
        this.name = String(name); this.names = []; this.initial = []; this.gates = [];
        this.flops = []; this.inputs = {}; this.outputs = {}; this.memories = [];
        this.drivers = new Map(); this.zero = this.wire('$0', 0); this.one = this.wire('$1', 1);
        this.drivers.set(this.zero, 'constant'); this.drivers.set(this.one, 'constant');
    }
    wire(name = '', initial = 2) {
        if (this.names.length >= MAX_WIRES) throw new RangeError('Netlist wire budget exceeded');
        this.names.push(String(name)); this.initial.push(logicValue(initial)); return this.names.length - 1;
    }
    claim(wire, driver) {
        integer(wire, 0, this.names.length - 1, 'wire');
        if (this.drivers.has(wire)) throw new Error(`Multiple drivers on ${this.names[wire] || wire}; use RESOLVE`);
        this.drivers.set(wire, driver);
    }
    input(name, width = 1, initial = 0n) {
        integer(width, 1, 72, 'bus width'); this.unique(name, this.inputs);
        const bus = Array.from({ length: width }, (_, i) => this.wire(`${name}[${i}]`, Number((BigInt(initial) >> BigInt(i)) & 1n)));
        for (const pin of bus) this.claim(pin, 'input'); this.inputs[name] = bus; return bus;
    }
    unique(name, object) {
        if (!/^[A-Za-z_$][\w.$/-]*$/.test(name) || Object.hasOwn(object, name) || ['__proto__', 'constructor', 'prototype'].includes(name))
            throw new Error(`Invalid or duplicate port: ${name}`);
    }
    output(name, bus) { this.unique(name, this.outputs); this.outputs[name] = [...bus]; return bus; }
    constant(value, width) {
        integer(width, 1, 72, 'constant width'); value = BigInt(value);
        if (value < 0n || value >= 1n << BigInt(width)) throw new RangeError('Constant does not fit');
        return Array.from({ length: width }, (_, i) => (value >> BigInt(i)) & 1n ? this.one : this.zero);
    }
    drive(q, op, a, b = this.zero, c = this.zero, delay = 1) {
        integer(op, 0, ARITY.length - 1, 'gate'); integer(delay, 0, 1000000000, 'gate delay');
        this.claim(q, this.gates.length);
        this.gates.push({ op, a, b, c, q, delay }); return q;
    }
    gate(op, a, b = this.zero, c = this.zero, name = '', delay = 1) {
        return this.drive(this.wire(name), op, a, b, c, delay);
    }
    not(a) { return this.gate(Gate.NOT, a); }
    and(a, b) { return this.gate(Gate.AND, a, b); }
    or(a, b) { return this.gate(Gate.OR, a, b); }
    xor(a, b) { return this.gate(Gate.XOR, a, b); }
    mux(a, b, select) { return this.gate(Gate.MUX, a, b, select); }
    all(bits) { return this.reduce(bits, Gate.AND, this.one); }
    any(bits) { return this.reduce(bits, Gate.OR, this.zero); }
    reduce(bits, op, identity) {
        if (!bits.length) return identity;
        let level = [...bits];
        while (level.length > 1) { const next = []; for (let i = 0; i < level.length; i += 2)
            next.push(i + 1 < level.length ? this.gate(op, level[i], level[i + 1]) : level[i]); level = next; }
        return level[0];
    }
    bits(op, a, b = a) {
        if (a.length !== b.length) throw new RangeError('Bus width mismatch');
        return a.map((pin, i) => this.gate(op, pin, b[i]));
    }
    select(a, b, control) {
        if (a.length !== b.length) throw new RangeError('Mux width mismatch');
        return a.map((pin, i) => this.mux(pin, b[i], control));
    }
    eq(a, b) { return this.all(this.bits(Gate.XNOR, a, b)); }
    eqConstant(a, n) { return this.eq(a, this.constant(n, a.length)); }
    register(name, width, initial = 0n) {
        integer(width, 1, 72, 'register width');
        const q = Array.from({ length: width }, (_, i) => this.wire(`${name}[${i}]`, Number((BigInt(initial) >> BigInt(i)) & 1n)));
        for (const pin of q) this.claim(pin, 'flop');
        let connected = false;
        return { q, connect: (d, enable = this.one, reset = this.zero) => {
            if (connected || d.length !== width) throw new Error('Register already connected or width mismatch');
            connected = true;
            q.forEach((pin, i) => this.flops.push({ q: pin, d: d[i], enable, reset, initial: this.initial[pin] }));
        } };
    }
    /** Carry lookahead prefix network; no native integer arithmetic at execution time. */
    add(a, b, carry = this.zero) {
        if (a.length !== b.length || !a.length) throw new RangeError('Adder width mismatch');
        const p = this.bits(Gate.XOR, a, b); let g = this.bits(Gate.AND, a, b), prop = p;
        for (let stride = 1; stride < a.length; stride *= 2) {
            const nextG = [...g], nextP = [...prop];
            for (let i = stride; i < a.length; i++) {
                nextG[i] = this.or(g[i], this.and(prop[i], g[i - stride]));
                nextP[i] = this.and(prop[i], prop[i - stride]);
            }
            g = nextG; prop = nextP;
        }
        const carries = g.map((pin, i) => this.or(pin, this.and(prop[i], carry)));
        return { sum: p.map((pin, i) => this.xor(pin, i ? carries[i - 1] : carry)), carry: carries.at(-1), carries };
    }
    onesAdd(a, b) {
        const first = this.add(a, b), second = this.add(a, b, first.carry);
        return { sum: second.sum, carry: first.carry, carries: second.carries,
            overflow: this.and(this.not(this.xor(a.at(-1), b.at(-1))), this.xor(a.at(-1), second.sum.at(-1))) };
    }
    /** Synchronous binary/four-state RAM macro. Not a magnetic-core electrical model. */
    ram(name, { width, depth, address, data, write, readonly = [] }) {
        integer(width, 1, 72, 'RAM width'); integer(depth, 1, 131072, 'RAM depth');
        this.unique(name, Object.fromEntries(this.memories.map(m => [m.name, true])));
        if (this.memories.reduce((s, m) => s + m.width * m.depth, width * depth) > MAX_MEMORY_BITS)
            throw new RangeError('Memory bit budget exceeded');
        if (data.length !== width || address.length > 18 || address.length < Math.ceil(Math.log2(depth))) throw new RangeError('Invalid memory port width');
        const read = Array.from({ length: width }, (_, i) => this.wire(`${name}.read[${i}]`, 0));
        for (const pin of read) this.claim(pin, 'memory');
        for (const [lo, hi] of readonly) { integer(lo, 0, depth - 1, 'ROM start'); integer(hi, lo, depth - 1, 'ROM end'); }
        this.memories.push({ name, width, depth, address: [...address], data: [...data], write, read, readonly }); return read;
    }
    compile({ allowCycles = false } = {}) {
        const n = this.names.length, valid = pin => integer(pin, 0, n - 1, 'pin');
        for (const g of this.gates) [g.a, g.b, g.c, g.q].forEach(valid);
        for (const f of this.flops) [f.q, f.d, f.enable, f.reset].forEach(valid);
        for (const m of this.memories) [...m.address, ...m.data, ...m.read, m.write].forEach(valid);
        for (const bus of Object.values(this.outputs)) bus.forEach(valid);
        const flops = new Set(this.flops.map(f => f.q));
        for (const [pin, driver] of this.drivers) if (driver === 'flop' && !flops.has(pin)) throw new Error(`Unconnected flip-flop: ${this.names[pin]}`);
        const fanout = Array.from({ length: n }, () => []), pending = new Uint32Array(this.gates.length), levels = [];
        this.gates.forEach((g, index) => { for (const pin of [...new Set([g.a, g.b, g.c].slice(0, ARITY[g.op]))]) {
            fanout[pin].push(index); if (typeof this.drivers.get(pin) === 'number') pending[index]++;
        } });
        let ready = [...pending.keys()].filter(i => pending[i] === 0), seen = 0;
        while (ready.length) {
            levels.push(ready); seen += ready.length; const next = [];
            for (const i of ready) for (const j of fanout[this.gates[i].q]) if (--pending[j] === 0) next.push(j);
            ready = next;
        }
        if (seen !== this.gates.length && !allowCycles) throw new Error('Combinational loop; use timed simulation or a flip-flop boundary');
        // RAM address pins must not depend combinationally on any RAM read pin.
        const dependsOnRam = new Uint8Array(n);
        for (const m of this.memories) for (const pin of m.read) dependsOnRam[pin] = 1;
        for (const level of levels) for (const i of level) { const g = this.gates[i]; dependsOnRam[g.q] = Number([g.a, g.b, g.c].slice(0, ARITY[g.op]).some(p => dependsOnRam[p])); }
        for (const m of this.memories) if (m.address.some(p => dependsOnRam[p])) throw new Error('Memory address feedback needs a register boundary');
        const plan = { version: 1, name: this.name, names: [...this.names], initial: [...this.initial],
            gates: this.gates.map(g => ({ ...g })), flops: this.flops.map(f => ({ ...f })),
            inputs: structuredClone(this.inputs), outputs: structuredClone(this.outputs), memories: structuredClone(this.memories),
            levels, order: levels.flat(), fanout, cyclic: seen !== this.gates.length };
        let hash = 0xcbf29ce484222325n;
        for (const ch of JSON.stringify([plan.name, plan.names, plan.initial, plan.gates, plan.flops, plan.inputs, plan.outputs, plan.memories]))
            hash = BigInt.asUintN(64, (hash ^ BigInt(ch.charCodeAt(0))) * 0x100000001b3n);
        plan.fingerprint = hash.toString(16).padStart(16, '0');
        return plan;
    }
}
