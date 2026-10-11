import { PLUGBOARD_WORDS, PLUGBOARD_BASE, CONFIG_BOOT_ENTRY } from './boot.js';
import { TX2IOBus } from './peripherals.js';
import { Memory, MachineFault, REGISTERS } from './memory.js';
import { decodeInstruction, decodeBitSelector, disassemble } from './instruction.js';
import { STANDARD_CONFIGURATION } from './standard-config.js';
import { exchangeLoad, exchangeLoadWithoutSignExtension, exchangeStore, describeConfiguration, signExtend } from './exchange.js';
import { word, half, fromSigned, toSigned, isZero, isNegative, addOnes, indexAddress, joinHalves, leftHalf, rightHalf, quarter, putQuarter, rotate, maskFor, subtractOnes, arithmeticResult, WORD_MASK, formatOctal } from './word.js';
import { ConsoleInputs } from './devices.js';
import { arithmeticElement, activeSubwords, activeWordMask } from './alu.js';
export const SUPPORTED_OPERATIONS = Object.freeze(['LDA', 'LDB', 'LDC', 'LDD', 'LDE', 'STA', 'STB', 'STC', 'STD', 'STE', 'SKX', 'RSX', 'AUX', 'DPX', 'JMP', 'JPX', 'JNX', 'SKM', 'SPF', 'SPG', 'ADD', 'SUB', 'SED', 'EXA', 'EXX', 'ADX', 'FLF', 'FLG', 'ITE', 'ITA', 'UNA', 'DSA', 'INS', 'COM', 'JPA', 'JNA', 'JOV', 'CYA', 'CYB', 'CAB', 'SCA', 'SCB', 'SAB', 'NOA', 'NAB', 'MUL', 'DIV', 'TLY']);
/** Instruction-level research emulator. Unsupported opcodes and scheduling modes trap atomically.
 * There is intentionally no "unknown instruction = NOP" path and no pseudo-Sketchpad boot. */
export class TX2 {
    constructor({ profile = 'strict', historyLimit = 8192, memory = new Memory() } = {}) {
        if (!['strict', 'diagnostic-word-io', 'tx2-io-research'].includes(profile))
            throw new TypeError('Unknown machine profile');
        if (!Number.isInteger(historyLimit) || historyLimit < 0 || historyLimit > 100000)
            throw new RangeError('History limit must be 0..100000');
        this.profile = profile;
        this.io = profile === 'tx2-io-research' ? new TX2IOBus() : null;
        this.priorities = [0, ...Array.from({ length: 32 }, (_, i) => 0o40 + i)];
        this.memory = memory;
        this.historyLimit = historyLimit;
        this.inputs = new ConsoleInputs();
        this.inputs.attach(memory);
        this.devices = new Map();
        this.breakpoints = new Set();
        this.watchpoints = new Map();
        this.history = [];
        this.trace = [];
        this.accesses = [];
        this._executing = false;
        this._trapReferences = new Set();
        this.memory.onAccess = e => {
            this.accesses.push(e);
            if (!this._executing || !this.io || e.phase === 'register') return;
            const key = `${e.phase}:${e.address}`;
            // Read/modify/write is one operand reference for trap purposes. Do not
            // trap a second time on a metabit just set by the same instruction.
            if (this._trapReferences.has(key)) return;
            this._trapReferences.add(key);
            const action = this.io.require(0o42).access(e.phase, e.meta, e.address, this.K, this.virtualTime);
            if (action.mark) this.memory.setMeta(e.address, true);
            if (action.raise) this.raiseFlag(0o42);
        };
        this.reset();
    }
    reset({ clearMemory = false } = {}) {
        if (clearMemory) {
            this.memory.data.fill(0n);
            this.memory.meta.fill(0);
            this.memory.parityBits.fill(0);
            PLUGBOARD_WORDS.forEach((v, i) => this.memory.poke(PLUGBOARD_BASE + i, v));
        }
        this.P = 0;
        this.Q = 0;
        this.K = 0;
        this.N = 0n;
        this.X = new BigUint64Array(64);
        this.F = STANDARD_CONFIGURATION.slice();
        this.fault = null;
        this.flags = 0n;
        this.cycles = 0;
        this.overflow = false;
        this.overflowFlags = 0;
        this.stopped = true;
        this.reason = 'reset';
        this.history = [];
        this.trace = [];
        for (const r of Object.values(REGISTERS))
            this.memory.poke(r, 0n);
        this.inputs.ticks = 0n;
        this.virtualTime = 0;
        this.limbo = false;
        this.TSP = 0;
        this.dismissed = false;
        this.previousHold = false;
        this.io?.reset();
    }
    getRegister(name) {
        if (name in REGISTERS)
            return this.memory.peek(REGISTERS[name]);
        throw new TypeError(`Unknown register ${name}`);
    }
    setRegister(name, value) {
        if (!(name in REGISTERS))
            throw new TypeError(`Unknown register ${name}`);
        this.memory.write(REGISTERS[name], value, 'register');
    }
    load(image) {
        if (!image || image.diagnostics?.some(d => d.severity === 'error'))
            throw new Error('Refusing an invalid assembly image');
        if (!Array.isArray(image.words) || image.words.length > 131072)
            throw new Error('Invalid image words');
        const occupied = new Set();
        for (const entry of image.words) {
            if (!Array.isArray(entry) || entry.length !== 2)
                throw new Error('Invalid image entry');
            const [a, v] = entry;
            this.memory.address(a);
            if (!Number.isInteger(a) || typeof v !== 'bigint' || v < 0n || v > WORD_MASK || occupied.has(a))
                throw new Error('Invalid or overlapping image word');
            occupied.add(a);
        }
        const entry = image.entry ?? image.words[0]?.[0] ?? 0;
        this.memory.address(entry);
        this.reset({ clearMemory: true });
        for (const [a, v] of image.words)
            this.memory.poke(a, v);
        this.P = entry;
        this.TSP = entry;
        this.sourceMap = image.sourceMap ?? new Map();
        this.reason = 'loaded';
    }
    /** Cold reader boot: no user words are copied to RAM. F is initialized by
     * executing the published plugboard. Mounted bytes use the binary tape
     * file convention: logical beginning-of-tape stands in for an END MARK.
     * Analog motor acceleration and full CODABO panel wiring are not modeled. */
    bootTape(frames) {
        if (!this.io) throw new MachineFault('PROFILE', 'Paper-tape boot requires tx2-io-research');
        if (!(frames instanceof Uint8Array) || frames.length > 16000000)
            throw new RangeError('Expected at most 16 MB of tape frames');
        // Validate/copy before destroying the current machine state.
        const media = frames.slice();
        this.reset({ clearMemory: true });
        this.F.fill(0);
        this.io.require(0o52).mount(media);
        this.P = CONFIG_BOOT_ENTRY;
        this.TSP = CONFIG_BOOT_ENTRY;
        this.raiseFlag(0);
        this.sourceMap = new Map();
        this.reason = 'paper tape mounted; stopped at plugboard';
    }
    unsupported(message, inst) { throw new MachineFault('UNIMPLEMENTED', message, { P: this.P, instruction: inst?.word }); }
    resolve(i, indexed = true) {
        // A deferred word uses the low six bits of its LEFT half to select an
        // index, and its RIGHT half as the next address + defer bit. The original
        // instruction index is applied only after the last deferred cycle.
        // Tech. Manual vol. 2 §9-7. Cycle detection is a debugger safety facility,
        // not a historical TX-2 alarm or a claim of microcycle timing accuracy.
        let operand = i.address | (i.defer ? 0o400000 : 0);
        const seen = new Set();
        while (operand & 0o400000) {
            const physical = operand & 0o377777;
            if (seen.has(physical) || seen.size >= 4096)
                throw new MachineFault('DEFER_LOOP', 'Deferred address chain repeats or exceeds 4096 reads', { address: physical });
            seen.add(physical);
            const pointer = this.memory.read(physical, 'read', 'defer'), j = Number(leftHalf(pointer) & 63n), right = Number(rightHalf(pointer));
            operand = indexAddress(right & 0o377777, this.X[j]) | (right & 0o400000);
            this.N = joinHalves(leftHalf(this.N), BigInt(operand));
        }
        const a = indexed ? indexAddress(operand, this.X[i.index]) : operand;
        this.Q = a;
        return a;
    }
    state() { return { P: this.P, Q: this.Q, K: this.K, N: this.N, X: this.X.slice(), F: this.F.slice(), flags: this.flags, cycles: this.cycles, overflow: this.overflow, overflowFlags: this.overflowFlags, stopped: this.stopped, reason: this.reason, fault: this.fault ? { ...this.fault } : null, inputs: this.inputs.snapshot(), virtualTime: this.virtualTime, limbo: this.limbo, TSP: this.TSP, dismissed: this.dismissed, previousHold: this.previousHold, io: this.io?.snapshot(), devices: [...this.devices].map(([k, d]) => [k, d.snapshot()]) }; }
    restoreState(s) {
        for (const k of ['P', 'Q', 'K', 'N', 'flags', 'cycles', 'overflow', 'overflowFlags', 'stopped', 'reason', 'fault', 'virtualTime', 'limbo', 'TSP', 'dismissed', 'previousHold'])
            this[k] = s[k];
        this.overflowFlags ??= s.overflow ? 8 : 0;
        this.previousHold ??= false;
        this.X.set(s.X);
        this.F.set(s.F);
        if (s.io)
            this.io?.restore(s.io);
        this.inputs.restore(s.inputs);
        for (const [k, v] of s.devices)
            this.devices.get(k)?.restore(v);
    }
    step() { return this._step(); }
    _step(respectBreakpoints = false, ignoredAddress = null) {
        const before = this.state();
        let deviceEvent = false;
        let pc = this.P & 0o377777;
        this.accesses = [];
        this.memory.begin();
        this._executing = true;
        this._trapReferences.clear();
        try {
            this.dismissed = false;
            if (this.io) {
                for (const unit of this.io.poll(this.virtualTime)) {
                    this.raiseFlag(unit); deviceEvent = true;
                }
                if (this.limbo) {
                    if (!this.flags) {
                        const time = this.io.nextDeadline();
                        if (!Number.isFinite(time))
                            throw new MachineFault('WAIT', 'LIMBO: waiting for an external INOUT event');
                        this.virtualTime = time;
                        for (const unit of this.io.poll(time)) {
                            this.raiseFlag(unit); deviceEvent = true;
                        }
                    }
                    this.schedule(true);
                    if (this.limbo)
                        throw new MachineFault('WAIT', 'LIMBO: no runnable sequence');
                }
                // An external flag can arrive between debugger steps or worker
                // batches. Respect the previous HOLD before the next fetch,
                // rather than executing one stale instruction in the old sequence.
                else if (!this.previousHold) {
                    this.schedule(false);
                }
                pc = this.P & 0o377777;
            }
            // A sequence/device transition may have changed the fetch address.
            // Stop before executing it, while retaining an independently reversible
            // boundary event. Such events do not increment the instruction count.
            if (respectBreakpoints && pc !== ignoredAddress && this.breakpoints.has(pc)) {
                const delta = this.memory.commit();
                this._executing = false;
                this.stopped = true; this.reason = 'breakpoint'; this.fault = null;
                if (deviceEvent || delta.length || this.P !== before.P || this.K !== before.K ||
                    this.flags !== before.flags || this.virtualTime !== before.virtualTime || this.limbo !== before.limbo) {
                    this._recordHistory({ kind: 'boundary', pc, word: 0n,
                        text: 'SEQUENCE / DEVICE BOUNDARY — breakpoint', before, delta, accesses: this.accesses.slice() });
                }
                return { ok: true, boundary: true, pc, reason: this.reason };
            }
            this.N = this.memory.read(pc, 'execute');
            const i = decodeInstruction(this.N);
            this.advanceP(1);
            this.execute(i);
            this.previousHold = i.hold && !this.dismissed;
            if (this.io) {
                this.virtualTime += 5;
                for (const unit of this.io.poll(this.virtualTime))
                    this.raiseFlag(unit);
                if (this.dismissed || !i.hold)
                    this.schedule(this.dismissed);
            }
            this.fault = null;
            this.X[0] = 0n;
            this.cycles++;
            this.inputs.ticks = BigInt(this.io ? Math.floor(this.virtualTime / 10) : this.cycles);
            this.stopped = true;
            const watched = this.accesses.find(e => this.watchpoints.get(e.address)?.includes(e.kind));
            this.reason = watched ? `watchpoint ${watched.kind} ${formatOctal(watched.address, 6)}` : 'step';
            const delta = this.memory.commit();
            this._executing = false;
            this._recordHistory({ kind: 'instruction', pc, word: i.word, text: disassemble(i.word), before, delta, accesses: this.accesses.slice() });
            return { ok: true, pc, instruction: i, accesses: this.accesses, reason: this.reason };
        }
        catch (error) {
            this._executing = false;
            this.memory.rollback();
            this.restoreState(before);
            this.stopped = true;
            this.reason = error.message;
            this.fault = { code: error.code ?? 'ERROR', message: error.message, P: pc };
            return { ok: false, error: this.fault, pc };
        }
    }
    _recordHistory(entry) {
        this.history.push(entry);
        if (this.history.length > this.historyLimit) this.history.shift();
        this.trace.push({ pc: entry.pc, word: entry.word, text: entry.text, cycle: this.cycles, kind: entry.kind });
        if (this.trace.length > 1024) this.trace.shift();
    }
    /** Preserve P2.9 across ordinary sequencing (TM vol.2 §12-2.3).
     * Only sequence changes replace the mark. P is an 18-bit placekeeper;
     * instruction fetches and breakpoint addresses use its low 17 bits. */
    advanceP(delta) { this.P = (this.P & 0o400000) | ((this.P + delta) & 0o377777); }
    jumpP(address) { this.P = (this.P & 0o400000) | (address & 0o377777); }
    execute(i) {
        const cf = i.config === 0 ? 0 : this.F[i.config];
        const load = (existing = 0n, indexed = true) => { const m = this.memory.read(this.resolve(i, indexed)); this.setRegister('E', m); return exchangeLoad(cf, m, existing); };
        if (/^LD[ABCDE]$/.test(i.op)) {
            const reg = i.op.at(-1), old = this.getRegister(reg), m = this.memory.read(this.resolve(i));
            if (reg !== 'E')
                this.setRegister('E', m);
            this.setRegister(reg, exchangeLoad(cf, m, old));
            return;
        }
        if (/^ST[ABCDE]$/.test(i.op)) {
            const reg = i.op.at(-1), v = this.getRegister(reg), a = this.resolve(i), old = this.memory.read(a), out = exchangeStore(cf, v, old);
            this.memory.write(a, out);
            if (reg !== 'E')
                this.setRegister('E', out);
            return;
        }
        switch (i.op) {
            case 'SKX': {
                if ((i.config & 0o30) && !this.io)
                    this.unsupported('SKX flag/dismiss variants require the sequence-machine profile.', i);
                const t = BigInt(i.address) | (i.defer ? 131072n : 0n), x = this.X[i.index], mode = i.config & 7;
                let next = x, skip = false;
                if (mode === 0)
                    next = t;
                if (mode === 1)
                    next = half(~t);
                if (mode === 2)
                    next = addOnes(x, t, 18);
                if (mode === 3)
                    next = subtractOnes(x, t, 18);
                if (mode === 4 || mode === 5) {
                    skip = toSigned(x, 18) !== (mode === 4 ? toSigned(t, 18) : -toSigned(t, 18));
                    if (mode === 4 && x === 0n)
                        next = 262143n;
                    if (mode === 5 && x === 262143n)
                        next = 0n;
                }
                if (mode === 6) {
                    const difference = arithmeticResult(x, t, 18, true);
                    skip = !difference.overflow && toSigned(difference.value, 18) < 0n;
                }
                if (mode === 7) {
                    const sum = arithmeticResult(x, t, 18);
                    skip = !sum.overflow && toSigned(sum.value, 18) > 0n;
                    if (x === 262143n)
                        next = 0n;
                }
                if (i.index)
                    this.X[i.index] = next;
                if (skip)
                    this.advanceP(1);
                if (i.config & 0o20)
                    this.dismiss(i);
                if (i.config & 0o10) {
                    this.raiseFlag(i.index);
                    if (i.index === this.K)
                        this.dismissed = false;
                }
                return;
            }
            case 'RSX': {
                const v = load(this.X[i.index], false);
                if (i.index)
                    this.X[i.index] = half(v);
                return;
            }
            case 'AUX': {
                const v = load(0n, false);
                if (i.index)
                    this.X[i.index] = addOnes(this.X[i.index], half(v), 18);
                return;
            }
            case 'DPX': {
                const a = this.resolve(i, false), old = this.memory.read(a), raw = this.X[i.index], v = isNegative(raw, 18) ? raw | (WORD_MASK ^ 262143n) : raw;
                const out = exchangeStore(cf, v, old);
                this.memory.write(a, out);
                this.setRegister('E', out);
                return;
            }
            case 'JMP': {
                if (i.defer)
                    this.unsupported('Deferred JMP semantics are not enabled; use a verified indexed jump form.', i);
                if ((i.config & 0o20) && !this.io)
                    this.unsupported('Sequence dismissal is not implemented.', i);
                const savedP = this.P, savedQ = this.Q, a = i.config & 1 ? indexAddress(i.address, this.X[i.index]) : i.address;
                const e = this.getRegister('E');
                this.setRegister('E', joinHalves(i.config & 8 ? BigInt(savedQ) : leftHalf(e), i.config & 4 ? BigInt(savedP) : rightHalf(e)));
                if (i.config & 2 && i.index)
                    this.X[i.index] = BigInt(savedP);
                this.jumpP(a);
                if (i.config & 0o20)
                    this.dismiss(i);
                return;
            }
            case 'JPX':
            case 'JNX': {
                if (!i.hold && !this.io)
                    this.unsupported('Unheld index jump requires sequence dismissal.', i);
                const old = this.X[i.index], take = i.op === 'JPX' ? toSigned(old, 18) > 0n : toSigned(old, 18) < 0n, a = this.resolve(i, false);
                if (i.index)
                    this.X[i.index] = addOnes(old, fromSigned(toSigned(BigInt(i.config), 5), 18), 18);
                if (take) {
                    this.setRegister('E', joinHalves(leftHalf(this.getRegister('E')), BigInt(this.P)));
                    this.jumpP(a);
                    if (!i.hold)
                        this.dismiss(i);
                }
                return;
            }
            case 'SKM': {
                const a = this.resolve(i, false), selector = decodeBitSelector(i.index), metaBefore = this.memory.getMeta(a), old = this.memory.read(a);
                let previous = null, v = old;
                if (selector.bit >= 1 && selector.bit <= 9)
                    previous = (old & selector.mask) !== 0n;
                else if (selector.bit === 10)
                    previous = metaBefore;
                else if (selector.bit === 11 || selector.bit === 12)
                    previous = !!this.memory.parityBits[a];
                const operation = i.config & 3;
                if (previous !== null && selector.bit <= 10) {
                    const b = operation === 1 ? !previous : operation === 2 ? false : operation === 3 ? true : previous;
                    if (selector.bit === 10 && operation)
                        this.memory.setMeta(a, b);
                    else if (operation)
                        v = b ? v | selector.mask : v & ~selector.mask;
                }
                if (i.config & 4)
                    v = rotate(v, 1);
                if (v !== old)
                    this.memory.write(a, v);
                const cond = (i.config >> 3) & 3;
                if (cond === 1 || (previous !== null && (cond === 2 && !previous || cond === 3 && previous)))
                    this.advanceP(1);
                return;
            }
            case 'SED': {
                const e = this.getRegister('E'), value = this.memory.read(this.resolve(i));
                if (exchangeLoadWithoutSignExtension(cf, value, e) !== e)
                    this.advanceP(1);
                return;
            }
            case 'SPF': {
                const v = this.memory.read(this.resolve(i));
                this.setRegister('E', v);
                if (i.config)
                    this.F[i.config] = quarter(v, 0);
                return;
            }
            case 'SPG': {
                const v = this.memory.read(this.resolve(i));
                this.setRegister('E', v);
                for (let q = 0; q < 4; q++)
                    if ((i.config + q) & 31)
                        this.F[(i.config + q) & 31] = quarter(v, q);
                return;
            }
            case 'FLF':
            case 'FLG': {
                const a = this.resolve(i), old = this.memory.read(a);
                let out = i.op === 'FLF' ? old : 0n;
                for (let q = 0; q < (i.op === 'FLF' ? 1 : 4); q++)
                    out = putQuarter(out, q, this.F[(i.config + q) & 31]);
                this.memory.write(a, out);
                this.setRegister('E', out);
                return;
            }
            case 'EXA': {
                const original = this.getRegister('A'), a = this.resolve(i), m = this.memory.read(a);
                const stored = exchangeStore(cf, original, m);
                this.memory.write(a, stored);
                if (a !== REGISTERS.A)
                    this.setRegister('A', exchangeLoad(cf, m, original));
                this.setRegister('E', stored);
                return;
            }
            case 'EXX': {
                const x = this.X[i.index], extended = isNegative(x, 18) ? x | (WORD_MASK ^ 262143n) : x;
                const a = this.resolve(i, false), m = this.memory.read(a), out = exchangeStore(cf, extended, m);
                const next = half(exchangeLoad(cf, m, x));
                this.memory.write(a, out);
                this.setRegister('E', out);
                if (i.index)
                    this.X[i.index] = next;
                return;
            }
            case 'ADX': {
                const a = this.resolve(i, false), m = this.memory.read(a);
                const sum = addOnes(this.X[i.index], half(exchangeLoad(cf, m, 0n)), 18);
                const extended = isNegative(sum, 18) ? sum | (WORD_MASK ^ 262143n) : sum;
                const out = exchangeStore(cf, extended, m);
                this.memory.write(a, out);
                this.setRegister('E', out);
                return;
            }
            case 'ITE': {
                const e = this.getRegister('E'), m = this.memory.read(this.resolve(i));
                const mask = activeWordMask(cf, true), b = exchangeLoadWithoutSignExtension(cf, m, 0n);
                this.setRegister('E', (e & ~mask) | (e & b & mask));
                return;
            }
            case 'ITA':
            case 'UNA':
            case 'DSA': {
                const a = this.getRegister('A'), oldD = this.getRegister('D'), oldC = this.getRegister('C');
                const m = this.memory.read(this.resolve(i)), b = exchangeLoad(cf, m, 0n), mask = activeWordMask(cf);
                const result = i.op === 'ITA' ? a & b : i.op === 'UNA' ? a | b : a ^ b;
                this.setRegister('A', (a & ~mask) | (result & mask));
                if (i.op === 'DSA') {
                    this.setRegister('C', oldC | (a & b & mask));
                    this.setRegister('D', exchangeLoad(cf, m, oldD));
                }
                this.setRegister('E', m);
                return;
            }
            case 'INS': {
                const av = this.getRegister('A'), bv = this.getRegister('B');
                const a = this.resolve(i), m = this.memory.read(a), aligned = exchangeLoadWithoutSignExtension(cf, m, 0n);
                const out = exchangeStore(cf, (aligned & ~bv) | (av & bv), m);
                this.memory.write(a, out);
                this.setRegister('E', out);
                return;
            }
            case 'COM': {
                const c = describeConfiguration(cf), a = this.resolve(i), m = this.memory.read(a);
                const permuted = exchangeLoadWithoutSignExtension(c.permutation, m, 0n);
                const out = signExtend(permuted ^ activeWordMask(cf), c.activity, c.fracture);
                this.memory.write(a, out);
                this.setRegister('E', out);
                return;
            }
            case 'JPA':
            case 'JNA':
            case 'JOV': {
                const av = this.getRegister('A');
                const take = activeSubwords(cf).some(s => {
                    const v = toSigned((av >> BigInt(s.offset)) & maskFor(s.bits), s.bits);
                    return i.op === 'JPA' ? v > 0n : i.op === 'JNA' ? v < 0n
                        : !!(this.overflowFlags & (1 << ((s.offset + s.bits) / 9 - 1)));
                });
                const target = this.resolve(i);
                if (take) {
                    this.setRegister('E', joinHalves(leftHalf(this.getRegister('E')), BigInt(this.P)));
                    this.jumpP(target);
                }
                return;
            }
            case 'ADD':
            case 'SUB':
            case 'MUL':
            case 'DIV':
            case 'TLY':
            case 'CYA':
            case 'CYB':
            case 'CAB':
            case 'SCA':
            case 'SCB':
            case 'SAB':
            case 'NOA':
            case 'NAB': {
                const before = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map(n => [n, this.getRegister(n)]));
                const m = this.memory.read(this.resolve(i)), result = arithmeticElement(i.op, cf, m, before, this.overflowFlags);
                for (const n of ['A', 'B', 'C', 'D', 'E'])
                    if (result[n] !== before[n])
                        this.setRegister(n, result[n]);
                this.overflowFlags = result.overflowFlags;
                this.overflow = result.overflowFlags !== 0;
                return;
            }
            case 'OPR': {
                if (!this.io)
                    this.unsupported('IOS requires the TX-2 INOUT research profile.', i);
                const operand = i.address | (i.defer ? 0o400000 : 0), unit = i.index;
                if (operand & 0o300000)
                    this.unsupported('AOP/undefined OPR subcodes are not implemented', i);
                if (i.config & 1)
                    this.setRegister('E', this.io.report(unit, this.flags));
                if (i.config & 0o20)
                    this.dismiss(i);
                if (operand === 0)
                    return;
                if (operand === 0o20000)
                    this.io.disconnect(unit);
                else if (operand >= 0o30000 && operand <= 0o37777) {
                    if (this.io.connect(unit, operand & 0o7777, this.virtualTime))
                        this.raiseFlag(unit);
                }
                else if (operand === 0o40000)
                    this.lowerFlag(unit);
                else if (operand === 0o50000) {
                    this.raiseFlag(unit);
                    if (unit === this.K)
                        this.dismissed = false;
                }
                else
                    this.unsupported('Unknown/select-unit IOS command', i);
                return;
            }
            case 'TSD': {
                if (this.io) {
                    const a = this.resolve(i), v = this.memory.read(a);
                    if ([0, 0o75, 0o76].includes(this.K)) {
                        this.memory.write(a, rotate(v, 1));
                        this.dismiss(i);
                        return;
                    }
                    const d = this.io.require(this.K);
                    // Normal transfers use permutation/activity, never sign extension.
                    const assembly = !!(d.mode & 2);
                    if (!assembly && cf !== 0)
                        this.unsupported('Configured peripheral TSD transfers have not been verified', i);
                    const result = this.io.transfer(this.K, v, this.virtualTime);
                    if (!result) {
                        this.advanceP(-1);
                        this.dismiss(i, true);
                        return;
                    }
                    if (result.value !== undefined) {
                        this.memory.write(a, result.value);
                        this.setRegister('E', result.value);
                    }
                    else
                        this.setRegister('E', v);
                    this.dismiss(i);
                    if (result.raise !== undefined)
                        this.raiseFlag(result.raise);
                    return;
                }
                if (this.profile !== 'diagnostic-word-io')
                    this.unsupported('TSD peripheral transfer timing and sequence handshake are not implemented in strict mode.', i);
                const d = this.devices.get(this.K);
                if (!d)
                    this.unsupported(`No diagnostic device attached to sequence ${this.K.toString(8)}`, i);
                d.write(this.memory.read(this.resolve(i)));
                return;
            }
            default: this.unsupported(`${i.op ?? 'Unknown opcode'} has no verified execution implementation.`, i);
        }
    }
    raiseFlag(unit) { if (!this.priorities.includes(unit))
        throw new MachineFault('IOSAL', 'Only 0 and 40–77 are sequence numbers'); this.flags |= 1n << BigInt(unit); }
    lowerFlag(unit) { if (!this.priorities.includes(unit))
        throw new MachineFault('IOSAL', 'Invalid sequence flag'); this.flags &= ~(1n << BigInt(unit)); }
    dismiss(instruction, force = false) { if (!this.io)
        this.unsupported('Sequence machine is not enabled', instruction); if (!instruction.hold || force) {
        this.lowerFlag(this.K);
        this.dismissed = true;
    } }
    schedule(all = false) {
        const rank = this.priorities.indexOf(this.K);
        if (rank < 0)
            throw new MachineFault('IOSAL', 'Invalid current sequence');
        const candidate = this.priorities.find((unit, index) => (all || index < rank) && !!(this.flags & (1n << BigInt(unit))));
        if (candidate === undefined) {
            if (all)
                this.limbo = true;
            return;
        }
        this.limbo = false;
        if (candidate === this.K)
            return;
        const next = candidate === 0 ? BigInt(this.TSP) : this.X[candidate];
        const old = this.K, p = this.P;
        const intercepted = this.io?.require(0o42).intercept(old, candidate, next, this.virtualTime);
        const target = intercepted ? 0o42 : candidate;
        if (intercepted) this.raiseFlag(0o42);
        if (old !== 0)
            this.X[old] = BigInt(p);
        this.setRegister('E', (BigInt(old) << 27n) | (BigInt(candidate) << 18n) | BigInt(p));
        this.P = Number(target === 0 ? BigInt(this.TSP) : this.X[target]);
        this.K = target;
    }
    run({ budget = 10000, ignoreInitialBreakpoint = false } = {}) {
        if (!Number.isInteger(budget) || budget < 1 || budget > 1000000)
            throw new RangeError('Instruction budget must be 1..1000000');
        this.stopped = false;
        let executed = 0;
        while (executed < budget) {
            const ignoredAddress = ignoreInitialBreakpoint && executed === 0 ? this.P & 0o377777 : null;
            const r = this._step(true, ignoredAddress);
            if (!r.ok || r.boundary)
                break;
            executed++;
            if (this.reason.startsWith('watchpoint'))
                break;
        }
        if (executed === budget)
            this.reason = 'budget';
        this.stopped = true;
        return { executed, reason: this.reason, P: this.P };
    }
    back() {
        const h = this.history.pop();
        if (!h)
            return false;
        this.memory.rollback(h.delta);
        this.restoreState(h.before);
        this.trace.pop();
        this.stopped = true;
        this.reason = h.kind === 'boundary' ? 'reverse sequence/device boundary' : 'reverse step';
        return true;
    }
    snapshot() { return { format: 'tx2-lab-snapshot/1', profile: this.profile, state: this.state(), memory: this.memory.snapshot(), media: this.io ? { petr: this.io.devices.get(0o52).frames.slice() } : undefined }; }
    restore(snapshot) {
        if (snapshot.format !== 'tx2-lab-snapshot/1' || snapshot.profile !== this.profile)
            throw new Error('Snapshot profile mismatch');
        if (this.io && snapshot.media?.petr)
            this.io.devices.get(0o52).mount(snapshot.media.petr);
        this.memory.restore(snapshot.memory);
        this.restoreState(snapshot.state);
        this.history = [];
        this.trace = [];
    }
}
