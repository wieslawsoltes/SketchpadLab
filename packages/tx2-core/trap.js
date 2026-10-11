/**
 * TX-2 TRAP circuit (unit 42 octal), instruction-boundary model.
 * Mode definitions: Users Handbook, TRAP, §4-15; the marked-placekeeper
 * interlock and E report follow §4-3.1 and TX-2 Simulator control.rs.
 * Electrical propagation delays are deliberately not invented here.
 */
import { MachineFault } from './memory.js';
import { rotate } from './word.js';
export const TRAP_UNIT = 0o42;
export const TRAP_MODES = Object.freeze({
    instruction: 0o001, defer: 0o002, operand: 0o004, sequence: 0o010,
    markInstruction: 0o100, markDefer: 0o200, markOperand: 0o400
});
const SUPPORTED_MODE_MASK = 0o717;
const PHASES = Object.freeze({ execute: [0o001, 0o100], defer: [0o002, 0o200], operand: [0o004, 0o400] });
export class TrapCircuit {
    constructor() { this.output = false; this.reset(); }
    reset() {
        this.mode = 0; this.connected = false; this.ready = false;
        this.readyAt = null; this.missed = false; this.markingDisabled = false;
        this.count = 0; this.last = null;
    }
    connect(mode) {
        if (!Number.isInteger(mode) || mode < 0 || (mode & ~SUPPORTED_MODE_MASK))
            throw new MachineFault('UNIMPLEMENTED', 'Undefined TRAP mode bits', { mode });
        this.mode = mode; this.connected = true; return false;
    }
    // Disconnect has no effect on the TRAP circuit (UH §4-15).
    disconnect() {}
    poll() { return false; }
    transfer(value) { return { value: rotate(value, 1) }; }
    access(phase, marked, address, sequence, time) {
        const modes = PHASES[phase];
        if (!modes) return { mark: false, raise: false };
        const raise = !!(marked && (this.mode & modes[0]));
        if (raise) this.record(phase, address, sequence, time);
        return { mark: !this.markingDisabled && !!(this.mode & modes[1]), raise };
    }
    intercept(previousSequence, nextSequence, placekeeper, time) {
        const raise = !!(this.mode & TRAP_MODES.sequence) && previousSequence !== TRAP_UNIT
            && nextSequence > TRAP_UNIT && !!(placekeeper & 0o400000n);
        if (raise) this.record('sequence', Number(placekeeper & 0o377777n), nextSequence, time);
        return raise;
    }
    record(phase, address, sequence, time) {
        this.count++;
        this.last = Object.freeze({ phase, address, sequence, time });
    }
    snapshot() {
        return { mode: this.mode, connected: this.connected, ready: false, readyAt: null,
            missed: false, markingDisabled: this.markingDisabled, count: this.count,
            last: this.last ? { ...this.last } : null };
    }
    restore(s) {
        if (!Number.isInteger(s?.mode) || s.mode < 0 || (s.mode & ~SUPPORTED_MODE_MASK)
            || !Number.isSafeInteger(s.count) || s.count < 0)
            throw new RangeError('Invalid TRAP snapshot');
        this.mode = s.mode; this.connected = !!s.connected;
        this.markingDisabled = !!s.markingDisabled; this.count = s.count;
        this.last = s.last ? Object.freeze({ ...s.last }) : null;
    }
}
