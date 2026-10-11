import { importNetlist } from './digital.js';
import { memorySchedule } from './memory-schedule.js';

export const NO_WRITE = 0xffffffff;
export const RESIDENT_HEADER_WORDS = 8;
export const MEMORY_DESCRIPTOR_WORDS = 11;

/** Immutable packed ABI shared by shader generation and result decoding.
 * Offsets and lengths count u32 words. Gates retain the original netlist order
 * within each topological level. No machine instruction semantics occur here. */
export function packResidentPlan(source, { probes = [], maxBatch = 16, maxJournalBytes = 16 * 1024 * 1024 } = {}) {
    const plan = importNetlist(source);
    if (plan.cyclic) throw new Error('Resident GPU execution requires an acyclic combinational netlist');
    if (!Array.isArray(probes) || probes.length > 128 || new Set(probes).size !== probes.length)
        throw new RangeError('Expected at most 128 distinct probe names');
    if (!Number.isInteger(maxBatch) || maxBatch < 1 || maxBatch > 256 ||
        !Number.isSafeInteger(maxJournalBytes) || maxJournalBytes < 4 || maxJournalBytes > 128 * 1024 * 1024)
        throw new RangeError('Invalid resident batch/journal budget');
    const data = [], append = values => { const offset = data.length; for (const v of values) data.push(v); return offset; };
    const schedule = memorySchedule(plan);
    const gates = append(schedule.order.flatMap(i => { const g = plan.gates[i]; return [g.op, g.a, g.b, g.c, g.q]; }));
    let offset = 0;
    const levels = append([...schedule.levels.map(level => { const start = offset; offset += level.length; return start; }), offset]);
    const flops = append(plan.flops.flatMap(f => [f.q, f.d, f.enable, f.reset, f.initial]));
    const driven = new Set(plan.gates.map(g => g.q));
    const roots = plan.names.map((_n, i) => i).filter(i => !driven.has(i));
    const rootOffset = append(roots);
    const memories = append(new Array(plan.memories.length * MEMORY_DESCRIPTOR_WORDS).fill(0));
    let ramWords = 0, recordWords = roots.length;
    const memoryLayout = plan.memories.map((m, i) => {
        const address = append(m.address), inputs = append(m.data), read = append(m.read), ranges = append(m.readonly.flat());
        const words = [m.width, m.depth, address, m.address.length, inputs, read, m.write,
            ramWords, ranges, m.readonly.length, recordWords];
        words.forEach((v, k) => data[memories + i * MEMORY_DESCRIPTOR_WORDS + k] = v);
        const result = { name: m.name, ramOffset: ramWords, recordOffset: recordWords, width: m.width, depth: m.depth };
        ramWords += m.width * m.depth;
        recordWords += 1 + 2 * m.width; // address or NO_WRITE; old word; new word
        return result;
    });
    const signals = probes.map(name => {
        const bus = plan.outputs[name] ?? plan.inputs[name];
        if (!bus) throw new Error(`Unknown probe ${name}`);
        return { name, bus: [...bus] };
    });
    const probePins = signals.flatMap(s => s.bus), probeOffset = append(probePins), sampleOffset = recordWords;
    recordWords += probePins.length;
    const ports = {};
    for (const name of ['halt', 'P', 'phase', 'retired', 'limbo']) {
        const bus = plan.outputs[name] ?? [];
        ports[name] = { offset: append(bus), width: bus.length };
    }
    // Bound shader work as well as allocations: a circuit with a deep divider
    // must not be allowed to submit hundreds of millions of gates in one batch.
    const evaluationPasses = 1; // RAM boundary partition evaluates each gate once per settle.
    const workBound = Math.max(1, Math.floor(8_000_000 / Math.max(1, plan.gates.length * evaluationPasses)) - 1);
    const capacity = Math.min(maxBatch, workBound, Math.floor(maxJournalBytes / Math.max(4, recordWords * 4)));
    if (capacity < 1) throw new RangeError('Resident journal budget cannot retain one clock');
    return { plan, schedule, data: Uint32Array.from(data), gates, levels, flops, roots, rootOffset, memories,
        memoryLayout, ramWords, recordWords, signals, probePins, probeOffset, sampleOffset, ports,
        capacity, wireWords: plan.names.length,
        recordsOffset: RESIDENT_HEADER_WORDS + plan.names.length,
        resultWords: RESIDENT_HEADER_WORDS + plan.names.length + capacity * recordWords };
}

/** Decode into temporary journals first; malformed readbacks never partially
 * mutate the mirror. Shape, ranges and logic values are checked independently. */
export function decodeResidentResult(layout, words, requested, startTicks) {
    if (!(words instanceof Uint32Array) || words.length !== layout.resultWords ||
        !Number.isInteger(requested) || requested < 1 || requested > layout.capacity ||
        !Number.isSafeInteger(startTicks) || startTicks < 0 || !Number.isSafeInteger(startTicks + requested))
        throw new Error('Invalid resident readback shape or clock budget');
    const executed = words[0], reason = words[1];
    if (executed > requested || reason > 6 || words[2] !== 0x54583247)
        throw new Error('Invalid resident readback header');
    if (reason >= 3) {
        const errors = ['', '', '', 'Indeterminate RAM write-enable', 'Indeterminate or out-of-range RAM write address',
            'Indeterminate stop/control signal', 'Invalid resident execution state'];
        throw new Error(errors[reason]);
    }
    const values = words.slice(RESIDENT_HEADER_WORDS, layout.recordsOffset);
    const valid = view => !view.some(v => v > 3);
    if (!valid(values) || values[0] !== 0 || values[1] !== 1) throw new Error('Invalid resident wire values');
    const journals = [], samples = [];
    for (let i = 0; i < executed; i++) {
        const base = layout.recordsOffset + i * layout.recordWords;
        const roots = words.slice(base, base + layout.roots.length);
        if (!valid(roots) || roots[0] !== 0 || roots[1] !== 1) throw new Error('Invalid resident root journal');
        const writes = [];
        layout.memoryLayout.forEach((m, mi) => {
            const at = base + m.recordOffset, offset = words[at];
            if (offset === NO_WRITE) return;
            if (offset % m.width !== 0 || offset + m.width > m.depth * m.width)
                throw new Error('Invalid resident memory journal address');
            const original = layout.plan.memories[mi];
            if (original.readonly.some(([lo, hi]) => offset / m.width >= lo && offset / m.width <= hi))
                throw new Error('Resident write targets read-only memory');
            const old = words.slice(at + 1, at + 1 + m.width), data = words.slice(at + 1 + m.width, at + 1 + 2 * m.width);
            if (!valid(old) || !valid(data)) throw new Error('Invalid resident memory journal values');
            writes.push({ mi, offset, old, data: Array.from(data) });
        });
        const sample = words.subarray(base + layout.sampleOffset, base + layout.recordWords);
        if (!valid(sample)) throw new Error('Invalid resident probe values');
        let at = 0;
        const bits = layout.signals.map(s => { const part = sample.subarray(at, at + s.bus.length); at += s.bus.length;
            return Array.from(part).reverse().map(v => '01xz'[v]).join(''); });
        journals.push({ ticks: startTicks + i, roots, writes });
        samples.push({ tick: startTicks + i + 1, bits });
    }
    return { executed, reason: ['budget', 'halt', 'condition'][reason], values, journals, samples };
}
