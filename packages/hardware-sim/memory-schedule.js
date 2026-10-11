import { ARITY } from './logic.js';

/** Split a validated combinational DAG at its asynchronous RAM read boundary.
 * Only ancestors of RAM address pins execute before the read. Every other gate
 * executes afterwards, exactly once, without speculating with stale RAM data.
 * Flip-flops are roots: their D dependencies do not cross this settle boundary.
 * O(wires + gates + edges), iterative even for very deep synthesized dividers.
 * Input is a CompiledNetlist returned by importNetlist; serialized schedules
 * must never bypass that validation at a public engine boundary. */
export function memorySchedule(plan) {
    if (plan.cyclic) throw new Error('Memory scheduling requires an acyclic netlist');
    const drivers = new Int32Array(plan.names.length).fill(-1);
    plan.gates.forEach((gate, index) => { drivers[gate.q] = index; });
    const reads = new Set(plan.memories.flatMap(memory => memory.read));
    const marked = new Uint8Array(plan.gates.length);
    const pending = plan.memories.flatMap(memory => memory.address);
    while (pending.length) {
        const pin = pending.pop();
        if (reads.has(pin)) throw new Error('RAM address depends on a RAM read; insert a register boundary');
        const index = drivers[pin];
        if (index < 0 || marked[index]) continue;
        marked[index] = 1;
        const g = plan.gates[index];
        pending.push(g.a);
        if (ARITY[g.op] > 1) pending.push(g.b);
        if (ARITY[g.op] > 2) pending.push(g.c);
    }
    const before = [], after = [];
    for (const level of plan.levels) {
        const a = [], b = [];
        for (const index of level) (marked[index] ? a : b).push(index);
        if (a.length) before.push(a);
        if (b.length) after.push(b);
    }
    const levels = [...before, ...after];
    return { levels, order: levels.flat(), readBoundary: before.length,
        beforeGates: before.reduce((n, level) => n + level.length, 0),
        afterGates: after.reduce((n, level) => n + level.length, 0) };
}
