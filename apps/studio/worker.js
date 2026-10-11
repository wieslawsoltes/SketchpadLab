import { TX2, DiagnosticVectorDevice, formatOctal, disassemble, SUPPORTED_OPERATIONS, REGISTERS, PLUGBOARD_WORDS, READER_LEADER_WORDS } from '../../packages/tx2-core/index.js';
import { assemble, serializeImage, encodeBinaryTape } from '../../packages/tx2-assembler/index.js';
let cpu = new TX2(), image = null, running = false, origin = 0o200, vector = null, runGeneration = 0, activeTape = null;
function state() {
    const mem = [];
    for (let i = 0; i < 32; i++) {
        const address = (origin + i) & 0o377777;
        try {
            mem.push({ address, value: formatOctal(cpu.memory.peek(address)), meta: cpu.memory.getMeta(address), watch: cpu.watchpoints.get(address) ?? '' });
        }
        catch {
            mem.push({ address, value: '------------', meta: false, watch: '' });
        }
    }
    return { trap: cpu.io?.require(0o42).snapshot(), tape: cpu.io?.require(0o52).snapshot(), bootingFromTape: !!activeTape, scope: cpu.io?.devices.get(0o60).points ?? [], virtualTime: cpu.virtualTime, limbo: cpu.limbo, flags: String(cpu.flags), inputs: { buttons: String(cpu.inputs.buttons), meta: !!cpu.inputs.buttonMeta, toggles: cpu.inputs.toggles.map(String) }, N: formatOctal(cpu.N), overflowFlags: cpu.overflowFlags, P: cpu.P, Q: cpu.Q, K: cpu.K, cycles: cpu.cycles, reason: cpu.reason, profile: cpu.profile, overflow: cpu.overflow, running, registers: Object.fromEntries(Object.keys(REGISTERS).map(k => [k, formatOctal(cpu.getRegister(k))])), X: [...cpu.X].map(v => formatOctal(v, 6)), F: [...cpu.F].map(v => formatOctal(v, 3)), memory: mem, origin, historyDepth: cpu.history.length, breakpoints: [...cpu.breakpoints], trace: cpu.trace.slice(-80).map(t => ({ pc: t.pc, cycle: t.cycle, text: t.text })), vectors: vector?.points ?? [], listing: (image?.listing ?? []).slice(0, 4096).map(l => ({ address: l.address, word: formatOctal(cpu.memory.data[l.address]), text: disassemble(cpu.memory.data[l.address]), line: l.line })), sourceLine: image?.sourceMap.get(cpu.P & 0o377777)?.line ?? null };
}
function send(type, payload = {}) { postMessage({ type, ...payload }); }
function stop() { running = false; runGeneration++; }
function encodeSnapshot(snapshot) { return JSON.stringify(snapshot, (_k, v) => typeof v === 'bigint' ? { __type: 'bigint', value: v.toString() } : v instanceof BigUint64Array ? { __type: 'BigUint64Array', value: [...v].map(x => x.toString()) } : v instanceof Uint8Array || v instanceof Uint16Array ? { __type: v.constructor.name, value: [...v] } : v); }
function decodeSnapshot(json) {
    if (json.length > 12000000)
        throw new Error('Snapshot exceeds 12 MB limit');
    return JSON.parse(json, (_k, v) => {
        if (v?.__type === 'bigint')
            return BigInt(v.value);
        if (['BigUint64Array', 'Uint8Array', 'Uint16Array'].includes(v?.__type)) {
            if (!Array.isArray(v.value) || v.value.length > 1 << 17)
                throw new Error('Invalid snapshot array');
            return v.__type === 'BigUint64Array' ? BigUint64Array.from(v.value, BigInt) : v.__type === 'Uint8Array' ? Uint8Array.from(v.value) : Uint16Array.from(v.value);
        }
        return v;
    });
}
function load(source, filename, profile, boot = false) {
    stop();
    const result = assemble(source, { filename });
    send('assembly', { diagnostics: result.diagnostics.slice(0, 2000), stats: result.stats });
    if (result.diagnostics.length) {
        image = null; activeTape = null;
        cpu.history = [];
        cpu.reason = 'assembly failed — execution disabled';
        send('state', { state: state() });
        return false;
    }
    let tape = null;
    try { tape = boot ? encodeBinaryTape(result) : null; }
    catch (error) {
        image = null; activeTape = null;
        cpu.history = [];
        cpu.reason = 'tape build failed — execution disabled';
        send('state', { state: state() });
        throw error;
    }
    if (boot) profile = 'tx2-io-research';
    const next = new TX2({ profile });
    let out = null;
    if (profile === 'diagnostic-word-io') {
        out = new DiagnosticVectorDevice();
        next.devices.set(1, out);
    }
    const panelInputs = cpu.inputs.snapshot();
    if (boot) {
        next.bootTape(tape);
        next.breakpoints.add(result.entry);
        origin = 0o377750;
    } else next.load(result);
    next.inputs.restore({ ...panelInputs, ticks: 0n, events: [] });
    if (out)
        next.K = 1;
    if (result.symbols.has('STOP'))
        next.breakpoints.add(Number(result.symbols.get('STOP')));
    cpu = next;
    vector = out;
    activeTape = tape;
    image = result;
    if (boot) image = { ...result, listing: [
        ...PLUGBOARD_WORDS.map((word, i) => ({ address: 0o377740 + i, word, line: 0, text: 'UH plugboard' })),
        ...READER_LEADER_WORDS.map((word, i) => ({ address: 3 + i, word, line: 0, text: 'UH reader leader' })),
        ...result.listing
    ] };
    send('state', { state: state() });
    return true;
}
onmessage = ({ data }) => {
    try {
        switch (data.type) {
            case 'assemble':
                load(data.source, data.filename ?? 'diagnostic.tx2', data.profile ?? 'strict');
                break;
            case 'boot-assembled':
                stop();
                // Failed punching must disable execution, just like failed assembly.
                image = null; activeTape = null;
                load(data.source, data.filename ?? 'diagnostic.tx2', 'tx2-io-research', true);
                break;
            case 'punch-tape':
                if (!image) throw new Error('Assemble a valid program first');
                send('download', { name: 'program.tape', bytes: encodeBinaryTape(image) });
                break;
            case 'step':
                stop();
                if (!image)
                    throw new Error('Assemble a valid program before stepping');
                cpu.step();
                send('state', { state: state() });
                break;
            case 'back':
                stop();
                cpu.back();
                send('state', { state: state() });
                break;
            case 'run': {
                stop();
                if (!image)
                    throw new Error('Assemble a valid program first');
                running = true;
                const generation = runGeneration;
                let remaining = Math.min(1000000, Math.max(1, data.budget ?? 100000));
                let first = true;
                const batch = () => {
                    if (!running || generation !== runGeneration)
                        return;
                    const result = cpu.run({ budget: Math.min(500, remaining), ignoreInitialBreakpoint: first });
                    first = false;
                    remaining -= result.executed;
                    if (result.reason !== 'budget' || remaining <= 0)
                        running = false;
                    send('state', { state: state() });
                    if (running)
                        setTimeout(batch, 0);
                };
                batch();
                break;
            }
            case 'pause':
                stop();
                cpu.reason = 'paused';
                send('state', { state: state() });
                break;
            case 'reset':
                stop();
                if (image) {
                    if (activeTape) cpu.bootTape(activeTape); else cpu.load(image);
                    if (vector) {
                        vector.points = [];
                        cpu.K = 1;
                    }
                }
                send('state', { state: state() });
                break;
            case 'breakpoint':
                if (cpu.breakpoints.has(data.address))
                    cpu.breakpoints.delete(data.address);
                else
                    cpu.breakpoints.add(data.address);
                send('state', { state: state() });
                break;
            case 'memory':
                origin = data.address;
                send('state', { state: state() });
                break;
            case 'write':
                stop();
                cpu.memory.address(data.address);
                cpu.memory.poke(data.address, BigInt('0o' + data.value));
                cpu.history = [];
                cpu.reason = 'debugger memory edit (history cleared)';
                send('state', { state: state() });
                break;
            case 'register':
                stop();
                cpu.setRegister(data.name, BigInt('0o' + data.value));
                cpu.history = [];
                cpu.reason = 'debugger register edit (history cleared)';
                send('state', { state: state() });
                break;
            case 'watch':
                if (data.kind)
                    cpu.watchpoints.set(data.address, data.kind);
                else
                    cpu.watchpoints.delete(data.address);
                send('state', { state: state() });
                break;
            case 'image':
                if (!image)
                    throw new Error('No assembled image');
                send('download', { name: 'program.tx2.json', text: serializeImage(image) });
                break;
            case 'snapshot-save':
                stop();
                send('download', { name: 'machine.snapshot.json', text: encodeSnapshot(cpu.snapshot()) });
                break;
            case 'snapshot-open':
                stop();
                cpu.restore(decodeSnapshot(data.text));
                send('state', { state: state() });
                break;
            case 'console-input':
                if (data.kind === 'button') {
                    const [q, b] = data.bit.split('.').map(Number);
                    cpu.inputs.button(q, b, !!data.pressed);
                }
                if (data.kind === 'knob')
                    cpu.inputs.knob(data.q, BigInt(data.value));
                if (data.kind === 'pen') {
                    cpu.inputs.setPen(data.x, data.y, !!data.down);
                    cpu.io?.devices.get(0o55).setPosition(data.x, data.y, !!data.down);
                }
                if (data.kind === 'toggle')
                    cpu.inputs.setToggle?.(data.address, BigInt(data.value));
                if (data.kind !== 'pen')
                    send('state', { state: state() });
                break;
            case 'state':
                send('state', { state: state() });
                break;
            default: throw new Error(`Unknown worker request '${data.type}'`);
        }
    }
    catch (error) {
        running = false;
        send('error', { message: error.message });
    }
};
send('ready', { supported: SUPPORTED_OPERATIONS });
