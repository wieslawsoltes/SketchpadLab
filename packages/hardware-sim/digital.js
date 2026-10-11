import { Gate, TRUTH_TABLE, logicGate, logicValue, readBus, writeBus } from './logic.js';
import { NetlistBuilder } from './netlist.js';
/** Revalidate imported data instead of trusting serialized execution order or driver maps. */
export function importNetlist(source) {
    if (source?.version !== 1 || !Array.isArray(source.names) || source.names.length < 2 || source.names.length > 500000 ||
        !Array.isArray(source.initial) || source.initial.length !== source.names.length ||
        !Array.isArray(source.gates) || source.gates.length > 500000 || !Array.isArray(source.flops) || source.flops.length > 500000 ||
        !Array.isArray(source.memories) || source.memories.length > 32) throw new Error('Invalid netlist schema or resource budget');
    if (source.initial[0] !== 0 || source.initial[1] !== 1) throw new Error('Netlist constants must be 0 and 1');
    const b = new NetlistBuilder(source.name);
    b.names = source.names.map(String); b.initial = source.initial.map(logicValue);
    for (const [name, bus] of Object.entries(source.inputs ?? {})) {
        b.unique(name, b.inputs);
        if (!Array.isArray(bus) || !bus.length || bus.length > 72) throw new Error('Invalid input bus');
        bus.forEach(pin => b.claim(pin, 'input')); b.inputs[name] = [...bus];
    }
    for (const g of source.gates) b.drive(g.q, g.op, g.a, g.b, g.c, g.delay);
    for (const f of source.flops) {
        b.claim(f.q, 'flop'); b.flops.push({ q: f.q, d: f.d, enable: f.enable, reset: f.reset, initial: logicValue(f.initial) });
    }
    let bits = 0;
    for (const m of source.memories) {
        if (!Number.isSafeInteger(m.width) || m.width < 1 || m.width > 72 || !Number.isSafeInteger(m.depth) || m.depth < 1 || m.depth > 131072 ||
            !Array.isArray(m.address) || m.address.length < Math.ceil(Math.log2(m.depth)) || m.address.length > 18 ||
            !Array.isArray(m.data) || m.data.length !== m.width || !Array.isArray(m.read) || m.read.length !== m.width ||
            !Array.isArray(m.readonly)) throw new Error('Invalid memory macro');
        bits += m.width * m.depth; if (bits > 16 * 1024 * 1024) throw new Error('Memory budget exceeded');
        for (const range of m.readonly) if (!Array.isArray(range) || range.length !== 2 || !Number.isInteger(range[0]) || !Number.isInteger(range[1]) ||
            range[0] < 0 || range[1] < range[0] || range[1] >= m.depth) throw new Error('Invalid read-only range');
        if (b.memories.some(other => other.name === m.name)) throw new Error('Duplicate memory name');
        m.read.forEach(pin => b.claim(pin, 'memory')); b.memories.push(structuredClone(m));
    }
    for (const [name, bus] of Object.entries(source.outputs ?? {})) {
        if (!Array.isArray(bus) || !bus.length || bus.length > 72) throw new Error('Invalid output bus');
        b.output(name, bus);
    }
    return b.compile({ allowCycles: true });
}
export function flopValue(values, f) {
    // Pins and reset values are validated once when importing the netlist.
    const enabled = TRUTH_TABLE[512 + values[f.q] + 4 * values[f.d] + 16 * values[f.enable]];
    return TRUTH_TABLE[512 + enabled + 4 * f.initial + 16 * values[f.reset]];
}
/** Clocked, levelized four-state interpreter. All datapath values come from gates. */
export class DigitalSimulator {
    constructor(plan, { historyLimit = 128, historyBytes = 8 * 1024 * 1024 } = {}) {
        this.plan = importNetlist(plan);
        if (this.plan.cyclic) throw new Error('Clocked backend does not accept combinational loops; use TimedSimulator');
        if (!Number.isInteger(historyLimit) || historyLimit < 0 || historyLimit > 10000 || !Number.isSafeInteger(historyBytes) || historyBytes < 0)
            throw new RangeError('Invalid history budget');
        this.values = Uint32Array.from(this.plan.initial); this.ticks = 0; this.backend = 'cpu-gates';
        const driven = new Set(this.plan.gates.map(g => g.q));
        this.roots = this.plan.names.map((_name, i) => i).filter(i => !driven.has(i));
        this.lastRoots = new Uint32Array(this.roots.length).fill(4);
        this.levelOf = new Uint32Array(this.plan.gates.length);
        this.plan.levels.forEach((level, i) => level.forEach(g => this.levelOf[g] = i));
        this.dirty = new Uint8Array(this.plan.gates.length);
        this.queues = this.plan.levels.map(() => []);
        this._invalidate();
        this.historyLimit = Math.min(historyLimit, Math.floor(historyBytes / Math.max(1, this.roots.length * 4)));
        this.history = []; this.evaluations = 0;
        this.memories = this.plan.memories.map(m => ({ ...m, values: new Uint32Array(m.width * m.depth) }));
        this.nextFlops = new Uint32Array(this.plan.flops.length);
        this.settle();
    }
    _mark(index) {
        if (!this.dirty[index]) { this.dirty[index] = 1; this.queues[this.levelOf[index]].push(index); }
    }
    _invalidate() { for (let i = 0; i < this.plan.gates.length; i++) this._mark(i); }
    _evaluate() {
        const v = this.values;
        for (let i = 0; i < this.roots.length; i++) {
            const pin = this.roots[i];
            if (v[pin] !== this.lastRoots[i]) { this.lastRoots[i] = v[pin]; for (const g of this.plan.fanout[pin]) this._mark(g); }
        }
        // A fanout gate is always in a later level. Process only gates whose
        // inputs changed; no heap, dynamic code generation, or instruction shortcut.
        for (let level = 0; level < this.queues.length; level++) {
            const queue = this.queues[level];
            for (const index of queue) {
                this.dirty[index] = 0;
                const g = this.plan.gates[index], value = TRUTH_TABLE[g.op * 64 + v[g.a] + 4 * v[g.b] + 16 * v[g.c]];
                this.evaluations++;
                if (v[g.q] !== value) { v[g.q] = value; for (const next of this.plan.fanout[g.q]) this._mark(next); }
            }
            queue.length = 0;
        }
    }
    _address(m) {
        let address = 0;
        for (let i = 0; i < m.address.length; i++) { const bit = this.values[m.address[i]]; if (bit > 1) return -1; address += bit * 2 ** i; }
        return address < m.depth ? address : -1;
    }
    settle() {
        this._evaluate();
        for (const m of this.memories) {
            const address = this._address(m);
            for (let i = 0; i < m.width; i++) this.values[m.read[i]] = address < 0 ? 2 : m.values[address * m.width + i];
        }
        if (this.memories.length) this._evaluate();
    }
    reset({ clearMemory = false } = {}) {
        this.values.set(this.plan.initial); this.ticks = 0; this.history.length = 0;
        if (clearMemory) for (const m of this.memories) m.values.fill(0);
        this._invalidate(); this.settle();
    }
    input(name, value) {
        const bus = this.plan.inputs[name]; if (!bus) throw new Error(`Unknown input ${name}`);
        writeBus(this.values, bus, value); this.history.length = 0; this.settle();
    }
    read(name) {
        const bus = this.plan.outputs[name] ?? this.plan.inputs[name]; if (!bus) throw new Error(`Unknown port ${name}`);
        return readBus(this.values, bus, name);
    }
    memory(name) { const m = this.memories.find(m => m.name === name); if (!m) throw new Error(`Unknown memory ${name}`); return m; }
    poke(name, address, value) {
        const m = this.memory(name);
        if (!Number.isInteger(address) || address < 0 || address >= m.depth) throw new RangeError('Memory address out of range');
        value = BigInt(value); if (value < 0n || value >= 1n << BigInt(m.width)) throw new RangeError('Memory word does not fit');
        for (let i = 0; i < m.width; i++) m.values[address * m.width + i] = Number((value >> BigInt(i)) & 1n);
        this.history.length = 0; this.settle();
    }
    peek(name, address) {
        const m = this.memory(name);
        if (!Number.isInteger(address) || address < 0 || address >= m.depth) throw new RangeError('Memory address out of range');
        let value = 0n;
        for (let i = m.width - 1; i >= 0; i--) { const bit = m.values[address * m.width + i]; if (bit > 1) throw new Error('Memory contains X/Z'); value = value * 2n + BigInt(bit); }
        return value;
    }
    clock() {
        if (!Number.isSafeInteger(this.ticks + 1)) throw new RangeError('Clock counter overflow');
        this.settle();
        // Validate every write before any storage element changes: bad control is atomic.
        const writes = [];
        for (let mi = 0; mi < this.memories.length; mi++) {
            const m = this.memories[mi], enable = this.values[m.write];
            if (enable === 0) continue;
            if (enable !== 1) throw new Error('Indeterminate RAM write-enable');
            const address = this._address(m);
            if (address < 0) throw new Error('Indeterminate or out-of-range RAM write address');
            if (m.readonly.some(([lo, hi]) => address >= lo && address <= hi)) continue;
            const offset = address * m.width;
            writes.push({ mi, offset, old: m.values.slice(offset, offset + m.width), data: m.data.map(p => this.values[p]) });
        }
        const before = this.historyLimit ? { ticks: this.ticks, roots: Uint32Array.from(this.roots, pin => this.values[pin]), writes } : null;
        for (let i = 0; i < this.plan.flops.length; i++) this.nextFlops[i] = flopValue(this.values, this.plan.flops[i]);
        for (const w of writes) this.memories[w.mi].values.set(w.data, w.offset);
        for (let i = 0; i < this.plan.flops.length; i++) this.values[this.plan.flops[i].q] = this.nextFlops[i];
        this.ticks++;
        if (before) { this.history.push(before); if (this.history.length > this.historyLimit) this.history.shift(); }
        this.settle();
        return this.ticks;
    }
    back() {
        const h = this.history.pop(); if (!h) return false;
        this.roots.forEach((pin, i) => this.values[pin] = h.roots[i]); this.ticks = h.ticks;
        for (const w of h.writes) this.memories[w.mi].values.set(w.old, w.offset);
        this.settle(); return true;
    }
    run(budget = 1, stop = 'halt') {
        if (!Number.isInteger(budget) || budget < 0 || budget > 1000000) throw new RangeError('Clock budget must be 0..1000000');
        const halt = this.plan.outputs[stop]; let executed = 0;
        while (executed < budget && (!halt || this.values[halt[0]] === 0)) { this.clock(); executed++; }
        return { executed, ticks: this.ticks, halted: !!halt && this.values[halt[0]] !== 0 };
    }
    snapshot() {
        return { schema: 'hardware-digital-1', fingerprint: this.plan.fingerprint, ticks: this.ticks,
            values: this.values.slice(), memories: this.memories.map(m => m.values.slice()) };
    }
    restore(state) {
        const valid = (values, length) => (Array.isArray(values) || ArrayBuffer.isView(values)) && values.length === length &&
            Array.from(values).every(v => Number.isInteger(v) && v >= 0 && v <= 3);
        if (state?.schema !== 'hardware-digital-1' || state.fingerprint !== this.plan.fingerprint ||
            !Number.isSafeInteger(state.ticks) || state.ticks < 0 || !valid(state.values, this.values.length) ||
            !Array.isArray(state.memories) || state.memories.length !== this.memories.length ||
            state.memories.some((m, i) => !valid(m, this.memories[i].values.length)) || state.values[0] !== 0 || state.values[1] !== 1)
            throw new Error('Snapshot does not match circuit, or contains invalid state');
        this.values.set(state.values); this.ticks = state.ticks;
        state.memories.forEach((m, i) => this.memories[i].values.set(m)); this.history.length = 0; this._invalidate(); this.settle();
    }
    stats() { return { backend: this.backend, wires: this.plan.names.length, gates: this.plan.gates.length,
        flipFlops: this.plan.flops.length, levels: this.plan.levels.length, memoryBits: this.memories.reduce((s, m) => s + m.values.length, 0),
        ticks: this.ticks, gateEvaluations: this.evaluations, reversibleTicks: this.history.length }; }
}
/** Bounded sampled waveforms, independently exportable to ordinary VCD viewers. */
export class Waveform {
    constructor(plan, names, { limit = 4096, tickNs = 1 } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100000 || !Number.isSafeInteger(tickNs) || tickNs < 1) throw new RangeError('Invalid waveform limits');
        this.signals = names.map(name => { const bus = plan.outputs[name] ?? plan.inputs[name]; if (!bus) throw new Error(`Unknown probe ${name}`); return { name, bus: [...bus] }; });
        if (this.signals.length > 128) throw new RangeError('Probe budget exceeded');
        this.limit = limit; this.tickNs = tickNs; this.samples = []; this.dropped = 0;
    }
    capture(simulator) {
        const sample = { tick: simulator.ticks, bits: this.signals.map(s => s.bus.map(p => simulator.values[p]).reverse().map(v => '01xz'[v]).join('')) };
        // Rewinding forks the visible trace; VCD timestamps must not run backwards.
        while (this.samples.length && this.samples.at(-1).tick >= sample.tick) this.samples.pop();
        this.samples.push(sample); if (this.samples.length > this.limit) { this.samples.shift(); this.dropped++; } return sample;
    }
    vcd() {
        const safe = name => name.replace(/[^A-Za-z0-9_$]/g, '_');
        let out = '$version Sketchpad Lab structural research simulator $end\n$timescale 1 ns $end\n$scope module circuit $end\n';
        this.signals.forEach((s, i) => out += `$var wire ${s.bus.length} p${i} ${safe(s.name)} $end\n`);
        out += '$upscope $end\n$enddefinitions $end\n';
        for (const s of this.samples) { out += `#${BigInt(s.tick) * BigInt(this.tickNs)}\n`; s.bits.forEach((bits, i) => out += `b${bits} p${i}\n`); }
        return out;
    }
}
