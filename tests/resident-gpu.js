/** Executed only by the real-browser WebGPU conformance fixture. */
import { NetlistBuilder } from '../packages/hardware-sim/netlist.js';
import { DigitalSimulator, Waveform } from '../packages/hardware-sim/digital.js';
import { Gate } from '../packages/hardware-sim/logic.js';
import { GPUResidentSimulator } from '../packages/hardware-sim/resident.js';
import { TX2GateBoard } from '../packages/hardware-sim/tx2-board.js';
import { assemble, encodeBinaryTape } from '../packages/tx2-assembler/index.js';

const assert = (value, why) => { if (!value) throw new Error(why); };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function compare(reference, actual, label) {
    assert(reference.ticks === actual.ticks, label + ' ticks');
    assert(same(reference.values, actual.values), label + ' wires');
    reference.memories.forEach((m, i) => assert(same(m.values, actual.memories[i].values), label + ' RAM ' + m.name));
}
const snapshotJSON = s => JSON.stringify(s.snapshot(), (_k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);

export async function testResidentGPU() {
    const report = { status: 'running', cases: [], physicalGPUVerified: false };
    let engine;
    try {
        // Many lanes, all X/Z cases, and no flops/memory: optional bindings still
        // have valid layouts even if dead code removes all storage operations.
        const b = new NetlistBuilder('resident truth table'), pins = b.input('states', 4);
        for (let op = 0; op < 11; op++) for (let c = 0; c < 4; c++) for (let a = 0; a < 4; a++) for (let d = 0; d < 4; d++)
            b.gate(op, pins[a], pins[d], pins[c]);
        const plan = b.compile(), reference = new DigitalSimulator(plan), actual = new DigitalSimulator(plan);
        for (const s of [reference, actual]) { pins.forEach((p, i) => s.values[p] = i); s.settle(); }
        engine = await GPUResidentSimulator.create(actual); reference.clock();
        const evaluations = actual.evaluations; await engine.clock();
        compare(reference, actual, 'resident truth table'); assert(actual.evaluations === evaluations, 'GPU executed CPU gates');
        engine.dispose(); engine = null; report.cases.push('704 four-state gates, without CPU forward evaluation');

        const c = new NetlistBuilder('resident storage'), count = c.register('counter', 8), en = c.input('write', 1, 1n);
        count.connect(c.add(count.q, c.constant(1, 8)).sum); c.output('counter', count.q);
        c.output('data', c.ram('RAM', { width: 8, depth: 256, address: count.q, data: c.bits(Gate.NOT, count.q), write: en[0], readonly: [[4, 7]] }));
        c.ram('meta', { width: 1, depth: 256, address: count.q, data: [count.q[0]], write: en[0] });
        const p = c.compile(), cpu = new DigitalSimulator(p), gpu = new DigitalSimulator(p), wave = new Waveform(p, ['counter', 'data']);
        engine = await GPUResidentSimulator.create(gpu, { probes: ['counter', 'data'], maxBatch: 32 });
        const startEvals = gpu.evaluations;
        let uploaded;
        for (const n of [7, 17, 32]) {
            wave.samples.length = 0;
            for (let i = 0; i < n; i++) { cpu.clock(); wave.capture(cpu); }
            const output = await engine.run(n); compare(cpu, gpu, 'resident batch ' + n);
            assert(JSON.stringify(output.samples) === JSON.stringify(wave.samples), 'Per-clock GPU probe samples');
            if (uploaded !== undefined) assert(engine.uploadedBytes === uploaded, 'Unchanged resident memory was reuploaded');
            uploaded = engine.uploadedBytes;
        }
        assert(gpu.evaluations === startEvals, 'Resident clock called host combinational evaluation');
        report.cases.push('56 batched clocks, exact probes, two RAM banks, read-only ranges and no repeated uploads');
        cpu.back(); gpu.back(); compare(cpu, gpu, 'reverse'); cpu.clock(); await engine.clock(); compare(cpu, gpu, 'reverse then continue');
        cpu.input('write', 0); gpu.input('write', 0); cpu.run(9); await engine.run(9); compare(cpu, gpu, 'external input');
        report.cases.push('reverse and external-input synchronization');
        const saved = snapshotJSON(gpu);
        gpu.values[p.inputs.write[0]] = 2; gpu.settle(); const invalid = snapshotJSON(gpu);
        let failed = false; try { await engine.run(5); } catch (e) { failed = /Indeterminate RAM/.test(e.message); }
        assert(failed && snapshotJSON(gpu) === invalid && !engine.busy, 'Indeterminate write was not atomic');
        gpu.restore(JSON.parse(saved)); await engine.clock(); cpu.clock(); compare(cpu, gpu, 'failed batch recovery');
        report.cases.push('atomic indeterminate-write failure and recovery');
        const concurrent = engine.run(2); let race = false;
        try { await engine.clock(); } catch (e) { race = /Concurrent/.test(e.message); } await concurrent; assert(race, 'Concurrent execution accepted');
        cpu.run(2); compare(cpu, gpu, 'concurrency');
        const editedRun = engine.run(2); gpu.input('write', 1); const edited = snapshotJSON(gpu);
        failed = false; try { await editedRun; } catch (e) { failed = /edited during/.test(e.message); }
        assert(failed && edited === snapshotJSON(gpu), 'Concurrent mirror edit lost');
        report.cases.push('concurrent execution/edit guards');
        report.storage = engine.stats(); engine.dispose(); engine = null;

        const image = assemble('.org 100\nREX_60 200\nIOS_60 30000\nJPD 102\n.org 200\nTSD 300\nSTOP: JMP STOP\n.org 300\n.word 123456765432');
        const ref = new TX2GateBoard(image, { inout: true, depth: 256 }), board = new TX2GateBoard(image, { inout: true, depth: 256 });
        engine = await GPUResidentSimulator.create(board.simulator, { probes: ['P', 'K', 'scopeCount'], maxBatch: 32 });
        const initEval = board.simulator.evaluations;
        for (let n = 0; n < 2; n++) { ref.simulator.run(32); await engine.run(32); compare(ref.simulator, board.simulator, 'INOUT resident'); }
        assert(board.state().scopeCount === 1n && board.simulator.evaluations === initEval, 'Gate peripheral output was not independent');
        report.cases.push('64 gate-driven INOUT clocks, sequence arbitration, scope trace RAM and no host execution');
        const stopped = await engine.run(8, { breakpoint: 0o201 });
        assert(stopped.reason === 'condition' && board.state().P === 0o201n && board.state().phase === 0n, 'Resident fetch breakpoint');
        const single = await engine.run(16, { retired: Number(board.state().retired) });
        assert(single.reason === 'condition', 'Resident instruction condition');
        report.cases.push('fetch breakpoint and instruction-boundary stops inside GPU batch');
        report.board = engine.stats(); engine.dispose(); engine = null;

        // A cold start with installed media. The real ROM instruction initializes
        // F-memory; no host payload/reader-leader preloading is permitted.
        const program = assemble('.org 100\nLDA 200\nSTOP: JMP STOP\n.org 200\n.word 123');
        const bootOptions = { inout: true, bootTape: encodeBinaryTape(program), deviceOptions: { readerPeriod:48 } };
        const boot = new TX2GateBoard(program, bootOptions), bootReference = new TX2GateBoard(program, bootOptions);
        assert(boot.simulator.peek('STUV', 0o100) === 0n && boot.simulator.peek('STUV', 3) === 0n, 'Boot data preloaded');
        engine = await GPUResidentSimulator.create(boot.simulator, { probes: ['P', 'K', 'tapePosition'], maxBatch:32 });
        const initialCpuEvals = boot.simulator.evaluations;
        const start = performance.now(); let clocks = 0;
        // The first 160 clocks cover configuration ROM, reader connection and
        // initial paper-tape frame transfers. Full boot remains covered on CPU.
        while (clocks < 160) { const n = Math.min(engine.batchCapacity, 160 - clocks); bootReference.simulator.run(n); await engine.run(n); clocks += n; }
        compare(bootReference.simulator, boot.simulator, 'GPU cold boot');
        assert(boot.state().tapePosition > 0n && boot.simulator.evaluations === initialCpuEvals, 'No GPU tape transfer');
        report.cases.push('160 cold-bootstrap clocks including ROM, F-memory and genuine tape-buffer transfer');
        report.boot = { ...engine.stats(), clocks, elapsedMs: performance.now() - start, fullBootstrapOnGPUVerified: false };
        engine.dispose(); engine = null;
        report.status = 'passed'; return report;
    } finally { engine?.dispose(); }
}
