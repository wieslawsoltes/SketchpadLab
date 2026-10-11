/** Instruction-level INOUT devices. Handshakes and formats are modeled, but
 * instruction durations, analog deflection and phosphor photometry are not
 * cycle-accurate. Unknown modes fault rather than becoming invented devices. */
import { TrapCircuit } from './trap.js';
import { word, rotate, toSigned } from './word.js';
import { MachineFault } from './memory.js';
export function cycleAndSplay(target, frame) {
    if (!Number.isInteger(frame) || frame < 0 || frame > 63)
        throw new RangeError('Splay frame must be six bits');
    let out = word(BigInt(target) << 1n) & ~1090785345n;
    for (let bit = 0; bit < 6; bit++)
        out |= BigInt((frame >> bit) & 1) << BigInt(bit * 6);
    return out;
}
export function unsplayWord(value) {
    const v = word(value);
    return Uint8Array.from({ length: 6 }, (_, n) => {
        let frame = 0;
        for (let bit = 0; bit < 6; bit++)
            frame |= Number((v >> BigInt(5 - n + bit * 6)) & 1n) << bit;
        return frame;
    });
}
/** Immutable sealed chunks make per-instruction reverse snapshots cheap. */
class EventLog {
    constructor(limit = 8192) { this.limit = limit; this.chunks = []; this.tail = []; }
    push(value) { this.tail.push(Object.freeze({ ...value })); if (this.tail.length === 128) {
        this.chunks.push(Object.freeze(this.tail));
        this.tail = [];
        while (this.chunks.length * 128 > this.limit)
            this.chunks.shift();
    } }
    values() { return [...this.chunks.flat(), ...this.tail]; }
    snapshot() { return { chunks: this.chunks.slice(), tail: this.tail.slice() }; }
    restore(s) { this.chunks = s.chunks.slice(); this.tail = s.tail.slice(); }
}
class Device {
    constructor() { this.reset(); }
    reset() { this.connected = false; this.mode = 0; this.readyAt = null; this.ready = false; this.missed = false; }
    connect(mode, time) { this.mode = mode; const was = this.connected; this.connected = true; if (!was && this.output)
        this.ready = true; return !was && this.output; }
    disconnect() { this.connected = false; this.readyAt = null; this.ready = false; }
    poll(time) { if (this.connected && this.readyAt !== null && time >= this.readyAt) {
        this.readyAt = null;
        this.ready = true;
        return true;
    } return false; }
    baseSnapshot() { return { connected: this.connected, mode: this.mode, readyAt: this.readyAt, ready: this.ready, missed: this.missed }; }
}
export class TX2Scope extends Device {
    constructor() { super(); this.output = true; this.spots = new EventLog(); }
    reset() { super.reset(); this.spots = new EventLog(); }
    connect(mode, time) { if (mode & ~0o330)
        throw new MachineFault('UNIMPLEMENTED', 'Scope film advance and unknown scope mode bits are not implemented'); return super.connect(mode, time); }
    transfer(v, time) {
        if (!this.connected || !this.ready)
            return null;
        let x = Number((v >> 26n) & 1023n), y = Number((v >> 8n) & 1023n);
        if (this.mode & 0o200)
            x ^= 512;
        if (this.mode & 0o100)
            y ^= 512;
        const dwell = 10 * (1 << ((this.mode >> 3) & 3));
        const spot = { x: Number(toSigned(x, 10)), y: Number(toSigned(y, 10)), time, intensity: dwell / 80, dwell };
        this.spots.push(spot);
        this.ready = false;
        this.readyAt = time + dwell;
        return { spot };
    }
    get points() { return this.spots.values(); }
    snapshot() { return { ...this.baseSnapshot(), spots: this.spots.snapshot() }; }
    restore(s) { Object.assign(this, s); this.spots = new EventLog(); this.spots.restore(s.spots); }
}
export class TX2LightPen extends Device {
    constructor() { super(); this.output = false; this.position = { x: 0, y: 0, down: false, radius: 8 }; this.hits = new EventLog(1024); }
    reset() { super.reset(); this.position = { x: 0, y: 0, down: false, radius: 8 }; this.hits = new EventLog(1024); }
    connect(mode, time) { if (mode !== 0)
        throw new MachineFault('UNIMPLEMENTED', 'Unknown light-pen mode'); return super.connect(mode, time); }
    setPosition(x, y, down = true, radius = 8) { if (![x, y, radius].every(Number.isFinite) || radius < 0 || radius > 1024)
        throw new RangeError('Invalid pen aperture/position'); this.position = { x, y, down, radius }; }
    illuminate(spot) { const p = this.position; if (!this.connected || !p.down || Math.hypot(p.x - spot.x, p.y - spot.y) > p.radius)
        return false; this.hits.push(spot); return true; }
    snapshot() { return { ...this.baseSnapshot(), position: { ...this.position }, hits: this.hits.snapshot() }; }
    restore(s) { Object.assign(this, s, { position: { ...s.position } }); this.hits = new EventLog(1024); this.hits.restore(s.hits); }
}
/** PETR with a single frame buffer and a free-running transport clock.
 * Modes 0100/0102 read; 0104/0106 rewind to the logical beginning then read.
 * The file boundary substitutes for the physical END MARK: raw seven-channel
 * control-code recognition and motor acceleration remain outside this model.
 * Modes 0/2 retain the 0.2 diagnostic stream interface (implicit motor start).
 * Bit 7 in a file byte is the TX-2 project's binary-file marker, not a data bit.
 */
export class TX2PaperTapeReader extends Device {
    constructor({ framesPerSecond = 400 } = {}) {
        super();
        if (!Number.isFinite(framesPerSecond) || framesPerSecond < 1 || framesPerSecond > 2500)
            throw new RangeError('Invalid tape speed');
        this.output = false; this.period = 1e6 / framesPerSecond;
        this.frames = new Uint8Array();
    }
    reset() {
        super.reset(); this.position = 0; this.buffer = null;
        this.direction = 'reel'; this.reverseAt = null; this.motor = false;
    }
    mount(frames) {
        if (!(frames instanceof Uint8Array) || frames.length > 16000000)
            throw new RangeError('Expected at most 16 MB of tape frames');
        this.frames = frames.slice(); this.position = 0;
        this.ready = false; this.buffer = null; this.readyAt = null;
        this.reverseAt = null; this.motor = false;
    }
    connect(mode, time) {
        if (!Number.isInteger(mode) || ![0, 2, 0o100, 0o102, 0o104, 0o106].includes(mode))
            throw new MachineFault('UNIMPLEMENTED', 'PETR seventh-channel control and this motor mode are not implemented');
        super.connect(mode, time);
        this.ready = false; this.buffer = null; this.missed = false; this.motor = true;
        if (mode & 4) {
            // Rewind distance is bounded by the mounted stream. A single 400 us
            // interval accounts for the logical beginning/reversal event.
            this.direction = 'bin'; this.reverseAt = time + (this.position + 1) * 400;
            this.position = 0;
        } else { this.direction = 'reel'; this.reverseAt = null; }
        this.readyAt = this.position < this.frames.length ? (this.reverseAt ?? time) + this.period : null;
        return false;
    }
    disconnect() { super.disconnect(); this.motor = false; this.buffer = null; this.reverseAt = null; }
    poll(time) {
        if (!this.connected || !this.motor) return false;
        if (this.reverseAt !== null && time >= this.reverseAt) {
            this.direction = 'reel'; this.reverseAt = null;
        }
        if (this.readyAt === null || time < this.readyAt) return false;
        // Catch up in O(1): unread physical frames are lost, not queued forever.
        const count = Math.min(this.frames.length - this.position, Math.floor((time - this.readyAt) / this.period) + 1);
        if (count <= 0) { this.readyAt = null; return false; }
        this.missed ||= this.ready || count > 1;
        this.position += count;
        this.buffer = this.frames[this.position - 1] & 63;
        this.ready = true;
        this.readyAt = this.position < this.frames.length ? this.readyAt + count * this.period : null;
        return true;
    }
    transfer(target, _time) {
        if (!this.connected || !this.ready || this.buffer === null) return null;
        const frame = this.buffer;
        const value = this.mode & 2 ? cycleAndSplay(target, frame) : (word(target) & ~63n) | BigInt(frame);
        this.ready = false; this.buffer = null;
        // Arrival is tied to the transport, never to CPU consumption time.
        return { value };
    }
    snapshot() { return { ...this.baseSnapshot(), position: this.position, buffer: this.buffer, direction: this.direction, reverseAt: this.reverseAt, motor: this.motor }; }
    restore(s) { Object.assign(this, s); this.direction ??= 'reel'; this.reverseAt ??= null;
        this.motor ??= this.connected; this.buffer ??= this.ready ? this.frames[this.position++] & 63 : null; }
}
export class TX2PaperTapePunch extends Device {
    constructor() { super(); this.output = true; this.frames = new EventLog(); }
    reset() { super.reset(); this.frames = new EventLog(); }
    connect(mode, time) { if (mode & ~6)
        throw new MachineFault('UNIMPLEMENTED', 'Unknown paper-tape punch mode'); return super.connect(mode, time); }
    transfer(value, time) {
        if (!this.connected || !this.ready)
            return null;
        let frame = 0;
        if (this.mode & 2) {
            for (let bit = 0; bit < 6; bit++)
                frame |= Number((value >> BigInt(5 + bit * 6)) & 1n) << bit;
        }
        else
            frame = Number(value & 63n);
        if (this.mode & 4)
            frame |= 64;
        this.frames.push({ frame, time });
        this.ready = false;
        this.readyAt = time + 1e6 / 180;
        return { value: this.mode & 2 ? rotate(value, 1) : value };
    }
    get outputFrames() { return Uint8Array.from(this.frames.values(), e => e.frame); }
    snapshot() { return { ...this.baseSnapshot(), frames: this.frames.snapshot() }; }
    restore(s) { Object.assign(this, s); this.frames = new EventLog(); this.frames.restore(s.frames); }
}
export class TX2IOBus {
    constructor() { this.devices = new Map([[0o42, new TrapCircuit()], [0o52, new TX2PaperTapeReader()], [0o55, new TX2LightPen()], [0o60, new TX2Scope()], [0o63, new TX2PaperTapePunch()]]); }
    reset() { for (const device of this.devices.values())
        device.reset(); }
    require(unit) { const d = this.devices.get(unit); if (!d)
        throw new MachineFault('UNIMPLEMENTED', `INOUT unit ${unit.toString(8)} is not implemented`); return d; }
    poll(time) { const flags = []; for (const [unit, d] of this.devices)
        if (d.poll(time))
            flags.push(unit); return flags; }
    nextDeadline() { let t = Infinity; for (const d of this.devices.values())
        if (d.connected && d.readyAt !== null)
            t = Math.min(t, d.readyAt); return t; }
    report(unit, flags) { const d = this.devices.get(unit); return (BigInt(unit) << 18n) | (((flags >> BigInt(unit)) & 1n) << 17n) | BigInt(d?.ready ? 1 << 16 : 0) | BigInt(d?.connected ? 1 << 14 : 0) | BigInt(d?.missed ? 1 << 12 : 0) | BigInt(d?.mode ?? 0); }
    connect(unit, mode, time) { return this.require(unit).connect(mode, time); }
    disconnect(unit) { this.require(unit).disconnect(); }
    transfer(unit, value, time) {
        const d = this.require(unit);
        if (!d.transfer)
            throw new MachineFault('UNIMPLEMENTED', 'Light pen has no data buffer; use flag 55');
        const result = d.transfer(value, time);
        if (result?.spot && this.devices.get(0o55).illuminate(result.spot))
            result.raise = 0o55;
        return result;
    }
    snapshot() { return [...this.devices].map(([unit, d]) => [unit, d.snapshot()]); }
    restore(snapshot) { for (const [unit, s] of snapshot)
        this.require(unit).restore(s); }
}
