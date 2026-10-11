import { importNetlist, flopValue } from './digital.js';
import { logicGate, logicValue, readBus } from './logic.js';
const timeValue = value => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Time must be a nonnegative integer number of nanoseconds');
    return value;
};
/** Stable binary min-heap; event order is (time, monotonically increasing id). */
class Events {
    constructor(items = []) { this.items = items; }
    less(a, b) { return a.time < b.time || a.time === b.time && a.id < b.id; }
    push(item) {
        const a = this.items; let i = a.length; a.push(item);
        while (i) { const p = (i - 1) >>> 1; if (!this.less(item, a[p])) break; a[i] = a[p]; i = p; } a[i] = item;
    }
    pop() {
        const a = this.items, first = a[0], last = a.pop();
        if (a.length) { let i = 0; while (2 * i + 1 < a.length) {
            let child = 2 * i + 1; if (child + 1 < a.length && this.less(a[child + 1], a[child])) child++;
            if (!this.less(a[child], last)) break; a[i] = a[child]; i = child;
        } a[i] = last; } return first;
    }
}
/** Discrete-event logic with explicit propagation delays, inertial cancellation,
 * simultaneous input batches, and zero-delay delta cycles. Not analog physics.
 * Flip-flops sample together at an explicit clock event; setup/hold is not modeled. */
export class TimedSimulator {
    constructor(plan, { delayModel = 'inertial', clockToQ = 1, maxEvents = 100000, traceLimit = 4096 } = {}) {
        this.plan = importNetlist(plan);
        if (this.plan.memories.length) throw new Error('Timed simulation requires explicit storage gates, not RAM macros');
        if (!['inertial', 'transport'].includes(delayModel)) throw new Error('Unknown delay model');
        if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 1000000 || !Number.isInteger(traceLimit) || traceLimit < 1 || traceLimit > 100000)
            throw new RangeError('Invalid event/trace budget');
        this.delayModel = delayModel; this.clockToQ = timeValue(clockToQ); this.maxEvents = maxEvents; this.traceLimit = traceLimit;
        this.values = Uint32Array.from(this.plan.initial); this.time = 0; this.serial = 0; this.processed = 0;
        this.tokens = new Float64Array(this.plan.gates.length); this.desired = new Uint32Array(this.plan.gates.length).fill(4);
        this.events = new Events(); this.trace = []; this.history = [];
        this.plan.gates.forEach((_g, i) => this._scheduleGate(i));
    }
    _push(event) {
        if (this.events.items.length >= this.maxEvents) throw new Error('Pending event budget exceeded');
        if (!Number.isSafeInteger(this.serial + 1)) throw new Error('Event sequence overflow');
        this.events.push({ ...event, time: timeValue(event.time), id: ++this.serial });
    }
    _scheduleGate(index) {
        const g = this.plan.gates[index], v = this.values, next = logicGate(g.op, v[g.a], v[g.b], v[g.c]);
        if (next === this.desired[index]) return;
        this.desired[index] = next; this.tokens[index]++;
        if (this.delayModel === 'inertial' && next === v[g.q]) return;
        this._push({ time: this.time + g.delay, pin: g.q, value: next, gate: index, token: this.tokens[index] });
    }
    input(name, value, at = this.time) {
        const bus = this.plan.inputs[name];
        if (!bus) throw new Error(`Unknown input ${name}`);
        timeValue(at); if (at < this.time) throw new Error('Cannot schedule in the past');
        const bits = Array.isArray(value) ? value.map(logicValue) : (() => {
            const n = BigInt(value); if (n < 0n || n >= 1n << BigInt(bus.length)) throw new RangeError('Input does not fit');
            return bus.map((_p, i) => Number(n >> BigInt(i) & 1n));
        })();
        if (bits.length !== bus.length || this.events.items.length + bits.length > this.maxEvents) throw new Error('Input width or event budget exceeded');
        bits.forEach((bit, i) => this._push({ time: at, pin: bus[i], value: bit, gate: -1, token: 0 }));
        this.history.length = 0;
    }
    clock(at = this.time) {
        timeValue(at); if (at < this.time) throw new Error('Cannot clock in the past');
        this._push({ time: at, clock: true }); this.history.length = 0;
    }
    runUntil(until, budget = this.maxEvents) {
        timeValue(until);
        if (until < this.time || !Number.isInteger(budget) || budget < 1 || budget > this.maxEvents) throw new RangeError('Invalid time/event budget');
        const before = this.snapshot(); let count = 0;
        try {
            while (this.events.items.length && this.events.items[0].time <= until) {
                this.time = this.events.items[0].time;
                const changed = new Set(); let clocks = 0;
                // Events generated below at this same timestamp are a new delta cycle.
                const batch = [];
                while (this.events.items.length && this.events.items[0].time === this.time) {
                    if (++count > budget) throw new Error('Event budget exceeded: possible oscillation or zero-delay loop');
                    batch.push(this.events.pop());
                }
                for (const event of batch) {
                    if (event.clock) { clocks++; continue; }
                    if (event.gate >= 0 && this.delayModel === 'inertial' && event.token !== this.tokens[event.gate]) continue;
                    if (this.values[event.pin] !== event.value) { this.values[event.pin] = event.value; changed.add(event.pin); }
                }
                // More than one clock at the same timestamp is ambiguous, not two physical edges.
                if (clocks > 1) throw new Error('Coincident clock events');
                if (clocks) for (const f of this.plan.flops)
                    this._push({ time: this.time + this.clockToQ, pin: f.q, value: flopValue(this.values, f), gate: -1, token: 0 });
                const affected = new Set();
                for (const pin of changed) for (const index of this.plan.fanout[pin]) affected.add(index);
                for (const index of affected) this._scheduleGate(index);
                if (changed.size) {
                    this.trace.push({ time: this.time, changes: [...changed].map(pin => [pin, this.values[pin]]) });
                    if (this.trace.length > this.traceLimit) this.trace.shift();
                }
            }
            this.time = until; this.processed += count;
            this.history.push(before); if (this.history.length > 8) this.history.shift();
            return { time: this.time, events: count, pending: this.events.items.length };
        } catch (error) { this._restore(before); throw error; }
    }
    read(name) { const bus = this.plan.outputs[name] ?? this.plan.inputs[name]; if (!bus) throw new Error(`Unknown port ${name}`); return readBus(this.values, bus, name); }
    snapshot() { return { schema: 'hardware-timed-1', fingerprint: this.plan.fingerprint, delayModel: this.delayModel, clockToQ: this.clockToQ,
        time: this.time, serial: this.serial, processed: this.processed, values: this.values.slice(), tokens: this.tokens.slice(), desired: this.desired.slice(),
        events: structuredClone(this.events.items), trace: structuredClone(this.trace) }; }
    _restore(s) { this.time = s.time; this.serial = s.serial; this.processed = s.processed; this.values.set(s.values); this.tokens.set(s.tokens); this.desired.set(s.desired);
        this.events = new Events(structuredClone(s.events)); this.trace = structuredClone(s.trace); }
    restore(s) {
        const array = (a, n, hi) => (Array.isArray(a) || ArrayBuffer.isView(a)) && a.length === n && Array.from(a).every(v => Number.isSafeInteger(v) && v >= 0 && v <= hi);
        if (s?.schema !== 'hardware-timed-1' || s.fingerprint !== this.plan.fingerprint || s.delayModel !== this.delayModel || s.clockToQ !== this.clockToQ ||
            !array([s.time, s.serial, s.processed], 3, Number.MAX_SAFE_INTEGER) || !array(s.values, this.values.length, 3) || s.values[0] !== 0 || s.values[1] !== 1 ||
            !array(s.tokens, this.tokens.length, Number.MAX_SAFE_INTEGER) || !array(s.desired, this.desired.length, 4) || !Array.isArray(s.events) ||
            s.events.length > this.maxEvents || !Array.isArray(s.trace) || s.trace.length > this.traceLimit) throw new Error('Invalid timed snapshot');
        const inputPins = new Set(Object.values(this.plan.inputs).flat()), flopPins = new Set(this.plan.flops.map(f => f.q)), ids = new Set();
        for (const e of s.events) {
            if (!Number.isSafeInteger(e.time) || e.time < s.time || !Number.isSafeInteger(e.id) || e.id < 1 || e.id > s.serial || ids.has(e.id)) throw new Error('Invalid event');
            ids.add(e.id); if (e.clock === true) continue;
            if (!Number.isInteger(e.pin) || e.pin < 2 || e.pin >= this.values.length || !Number.isInteger(e.gate) || e.gate < -1 || e.gate >= this.plan.gates.length ||
                !Number.isSafeInteger(e.token) || e.token < 0 || e.gate >= 0 && (this.plan.gates[e.gate].q !== e.pin || e.token > s.tokens[e.gate]) ||
                e.gate === -1 && !inputPins.has(e.pin) && !flopPins.has(e.pin)) throw new Error('Invalid event driver');
            logicValue(e.value);
        }
        let previous = -1;
        for (const t of s.trace) {
            if (!Number.isSafeInteger(t.time) || t.time < previous || t.time > s.time || !Array.isArray(t.changes) || t.changes.length > this.values.length) throw new Error('Invalid trace');
            for (const pair of t.changes) if (!Array.isArray(pair) || pair.length !== 2 || !array(pair, 2, this.values.length - 1) || pair[1] > 3) throw new Error('Invalid trace value');
            previous = t.time;
        }
        // Imported queues need not already be in heap order.
        const q = new Events(); for (const e of s.events) q.push(structuredClone(e));
        this._restore({ ...s, events: q.items }); this.history.length = 0;
    }
    back() { const state = this.history.pop(); if (!state) return false; this._restore(state); return true; }
}
