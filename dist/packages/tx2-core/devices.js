import { word, quarter, putQuarter, toSigned } from './word.js';
/** Deterministic host input registers. Host changes are recorded explicitly, never wall-clock sampled. */
export class ConsoleInputs {
    constructor() { this.toggles = Array(8).fill(0n); this.buttons = 0n; this.knobs = 0n; this.ticks = 0n; this.events = []; this.pen = { x: 0, y: 0, down: false }; }
    attach(memory) { this.memory = memory; for (let i = 0; i < 8; i++)
        memory.mapRead(0o377720 + i, () => this.toggles[i]); memory.mapRead(0o377620, () => this.knobs); memory.mapRead(0o377621, () => this.buttons); memory.mapRead(0o377630, () => this.ticks); }
    setToggle(address, value) { if (!Number.isInteger(address) || address < 0o20 || address > 0o27)
        throw new RangeError('Toggle address must be 20–27 octal'); this.toggles[address - 0o20] = word(value); this.record({ ticks: this.ticks, type: 'toggle', address, value: word(value) }); }
    button(q, b, pressed) {
        if (q < 1 || q > 4 || b < 1 || (b > 9 && !(q === 4 && b === 10)))
            throw new RangeError('Button requires quarter 1–4 and bit 1–9');
        if (b === 10) {
            this.buttonMeta = pressed;
            if (this.memory)
                this.memory.meta[0o377621] = pressed ? 1 : 0;
            this.record({ ticks: this.ticks, type: 'meta-button', pressed });
            return;
        }
        const m = 1n << BigInt((q - 1) * 9 + b - 1);
        this.buttons = pressed ? this.buttons | m : this.buttons & ~m;
        this.record({ ticks: this.ticks, type: 'button', q, b, pressed });
    }
    record(event) { if (this.events.length >= 512)
        this.events.splice(0, 128); this.events.push(event); }
    knob(q, value) { if (!Number.isInteger(q) || q < 1 || q > 4)
        throw new RangeError('Encoder quarter must be 1–4'); this.knobs = putQuarter(this.knobs, q - 1, value); this.record({ ticks: this.ticks, type: 'knob', q, value }); }
    setPen(x, y, down) { this.pen = { x, y, down }; this.record({ ticks: this.ticks, type: 'pen', x, y, down }); }
    snapshot() { return { buttonMeta: !!this.buttonMeta, toggles: this.toggles.slice(), buttons: this.buttons, knobs: this.knobs, ticks: this.ticks, pen: { ...this.pen }, events: this.events.slice() }; }
    restore(s) { Object.assign(this, s, { toggles: s.toggles?.slice() ?? Array(8).fill(0n), pen: { ...s.pen }, events: s.events.slice() }); if (this.memory)
        this.memory.meta[0o377621] = s.buttonMeta ? 1 : 0; }
}
/** Raw word queue for instrumented tests. NOT a PETR boot-tape implementation. */
export class WordTape {
    constructor(words = []) { this.words = Array.from(words, word); this.position = 0; this.output = []; }
    read() { return this.position < this.words.length ? this.words[this.position++] : null; }
    write(v) { this.output.push(word(v)); }
    snapshot() { return { position: this.position, output: this.output.slice() }; }
    restore(s) { this.position = s.position; this.output = s.output.slice(); }
}
/** Explicitly nonhistorical diagnostic endpoint: a 36-bit word contains signed 18-bit x,y.
 * Selected only by CPU profile 'diagnostic-word-io'. It must not be used to claim Sketchpad boot. */
export class DiagnosticVectorDevice {
    constructor() { this.points = []; this.limit = 32768; }
    write(v) {
        if (this.points.length >= this.limit)
            this.points.splice(0, this.limit / 4);
        this.points.push({ x: Number(toSigned(v >> 18n, 18)), y: Number(toSigned(v & 262143n, 18)) });
    }
    snapshot() { return this.points.slice(); }
    restore(s) { this.points = s.slice(); }
}
