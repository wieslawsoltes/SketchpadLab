import { TRUTH_TABLE } from './logic.js';
import { packResidentPlan, decodeResidentResult, NO_WRITE } from './resident-plan.js';
import { residentShader } from './resident-shader.js';

/** Device-resident circuit storage and multi-clock evaluation. The JavaScript
 * mirror is updated from a validated GPU journal once per batch, never by calling
 * its clock(), settle(), or instruction interpreter during forward execution.
 * Explicit mirror edits/reverse/restore are uploaded at the next batch boundary.
 * A RAM-dependency partition evaluates each gate once per settle.
 * One batch is transactional on validation, device-loss, or readback failure. */
export class GPUResidentSimulator {
    static async create(simulator, { gpu = globalThis.navigator?.gpu, ...options } = {}) {
        if (!gpu) throw new Error('WebGPU is unavailable; explicitly select CPU gates');
        const adapter = await gpu.requestAdapter();
        if (!adapter) throw new Error('No WebGPU adapter is available');
        const device = await adapter.requestDevice();
        let engine;
        try {
            engine = new GPUResidentSimulator(simulator, device, options);
            engine.adapter = { vendor: adapter.info?.vendor ?? '', architecture: adapter.info?.architecture ?? '',
                description: adapter.info?.description ?? '', isFallbackAdapter: adapter.info?.isFallbackAdapter ?? null };
            await engine.initialize();
            return engine;
        } catch (error) { if (engine) engine.dispose(); else device.destroy(); throw error; }
    }
    constructor(simulator, device, options = {}) {
        this.layout = packResidentPlan(simulator.plan, options);
        if (simulator.plan.fingerprint !== this.layout.plan.fingerprint || !Number.isSafeInteger(simulator.revision) || !Number.isSafeInteger(simulator.memoryRevision))
            throw new Error('Resident execution requires a matching versioned DigitalSimulator');
        this.simulator = simulator; this.device = device; this.busy = false; this.failure = null;
        this.backend = 'webgpu-resident'; this.resources = []; this.dispatches = 0; this.evaluations = 0;
        this.uploadedBytes = 0; this.readbackBytes = 0; this.uploadedRevision = -1; this.uploadedMemoryRevision = -1;
        this.batchCapacity = this.layout.capacity; this.initialized = false;
        device.lost.then(info => { this.failure = new Error(`WebGPU device lost: ${info.message || info.reason}`); });
    }
    async initialize() {
        if (this.initialized) throw new Error('Resident engine is already initialized');
        const d = this.device, U = globalThis.GPUBufferUsage, l = this.layout;
        if (!U) throw new Error('WebGPU buffer API is unavailable');
        d.pushErrorScope('validation'); d.pushErrorScope('out-of-memory');
        let error = null;
        try {
            const create = (name, words, usage, data) => {
                const size = Math.max(4, words * 4);
                if (size > d.limits.maxBufferSize || ((usage & U.STORAGE) && size > d.limits.maxStorageBufferBindingSize))
                    throw new Error(`${name} exceeds WebGPU buffer limits`);
                const buffer = d.createBuffer({ label: name, size, usage }); this.resources.push(buffer);
                if (data?.byteLength) d.queue.writeBuffer(buffer, 0, data);
                return buffer;
            };
            this.planBuffer = create('resident structural plan', l.data.length, U.STORAGE | U.COPY_DST, l.data);
            this.wireBuffer = create('resident wires and sampled flip-flops', l.wireWords + l.plan.flops.length, U.STORAGE | U.COPY_DST);
            this.ramBuffer = create('resident memory', l.ramWords, U.STORAGE | U.COPY_DST);
            this.resultBuffer = create('resident clock journals', l.resultWords, U.STORAGE | U.COPY_SRC);
            this.truthBuffer = create('resident four-state truth table', TRUTH_TABLE.length, U.STORAGE | U.COPY_DST, TRUTH_TABLE);
            this.parameters = create('resident bounded execution', 8, U.UNIFORM | U.COPY_DST);
            this.readback = create('resident batch readback', l.resultWords, U.MAP_READ | U.COPY_DST);
            const module = d.createShaderModule({ label: 'full circuit clock engine', code: residentShader(l) });
            const info = await module.getCompilationInfo(), errors = info.messages.filter(m => m.type === 'error');
            if (errors.length) throw new Error(errors.map(e => `${e.lineNum}:${e.linePos} ${e.message}`).join('\n'));
            const bindings = d.createBindGroupLayout({ entries: Array.from({ length: 6 }, (_v, binding) => ({
                binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: binding === 5 ? 'uniform' : [0, 4].includes(binding) ? 'read-only-storage' : 'storage' }
            })) });
            this.pipeline = await d.createComputePipelineAsync({ layout: d.createPipelineLayout({ bindGroupLayouts: [bindings] }), compute: { module, entryPoint: 'execute' } });
            this.bindGroup = d.createBindGroup({ layout: bindings, entries:
                [this.planBuffer, this.wireBuffer, this.ramBuffer, this.resultBuffer, this.truthBuffer, this.parameters]
                    .map((buffer, binding) => ({ binding, resource: { buffer } })) });
        } catch (e) { error = e; }
        const oom = await d.popErrorScope(), validation = await d.popErrorScope();
        if (error) throw error; if (oom || validation) throw new Error((oom || validation).message); if (this.failure) throw this.failure;
        this.initialized = true;
    }
    /** Required only for edits made by directly assigning exposed typed arrays.
     * Public DigitalSimulator mutations already advance its revision. */
    invalidate() { this.uploadedRevision = -1; this.uploadedMemoryRevision = -1; }
    _upload() {
        const s = this.simulator, l = this.layout;
        if (s.revision === this.uploadedRevision && s.memoryRevision === this.uploadedMemoryRevision) return;
        const memoryChanged = s.memoryRevision !== this.uploadedMemoryRevision;
        if (s.values.length !== l.wireWords || s.values[0] !== 0 || s.values[1] !== 1 || s.values.some(v => v > 3) ||
            s.memories.length !== l.memoryLayout.length || (memoryChanged && s.memories.some((m, i) => m.values.length !== l.memoryLayout[i].width * l.memoryLayout[i].depth || m.values.some(v => v > 3))))
            throw new Error('Invalid resident mirror state');
        this.device.queue.writeBuffer(this.wireBuffer, 0, s.values);
        this.uploadedBytes += s.values.byteLength;
        if (memoryChanged) s.memories.forEach((m, i) => { this.device.queue.writeBuffer(this.ramBuffer, l.memoryLayout[i].ramOffset * 4, m.values); this.uploadedBytes += m.values.byteLength; });
        this.uploadedMemoryRevision = s.memoryRevision;
        this.uploadedRevision = s.revision;
    }
    async run(budget = 1, { stop = true, breakpoint = null, retired = null } = {}) {
        if (this.busy) throw new Error('Concurrent resident GPU execution is not allowed');
        if (this.failure) throw this.failure;
        if (!this.initialized) throw new Error('Resident engine is not initialized');
        const l = this.layout, s = this.simulator;
        if (!Number.isInteger(budget) || budget < 1 || budget > this.batchCapacity || typeof stop !== 'boolean' ||
            !Number.isSafeInteger(s.ticks) || s.ticks < 0 || !Number.isSafeInteger(s.ticks + budget))
            throw new RangeError('Invalid resident clock budget');
        if (stop && l.ports.halt.width !== 0 && l.ports.halt.width !== 1) throw new Error('Stop signal must be one bit');
        if (breakpoint !== null && (!Number.isInteger(breakpoint) || breakpoint < 0 || breakpoint > 0o377777 ||
            l.ports.P.width !== 18 || l.ports.phase.width !== 2)) throw new Error('Breakpoint requires 18-bit P and 2-bit phase ports');
        if (retired !== null && (!Number.isInteger(retired) || retired < 0 || retired > 0xffffffff || l.ports.retired.width !== 32 ||
            l.ports.phase.width !== 2 || ![0, 1].includes(l.ports.limbo.width))) throw new Error('Instruction condition requires board control ports');
        this.busy = true;
        const d = this.device, startTicks = s.ticks, revision = s.revision, memoryRevision = s.memoryRevision;
        d.pushErrorScope('validation'); d.pushErrorScope('out-of-memory');
        let error = null, result;
        try {
            this._upload();
            d.queue.writeBuffer(this.parameters, 0, new Uint32Array([budget, Number(stop), breakpoint ?? NO_WRITE, Number(retired !== null), retired ?? 0, 0, 0, 0]));
            const commands = d.createCommandEncoder({ label: 'resident hardware clock batch' }), pass = commands.beginComputePass();
            pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.bindGroup);
            pass.dispatchWorkgroups(1); pass.end();
            commands.copyBufferToBuffer(this.resultBuffer, 0, this.readback, 0, l.resultWords * 4);
            d.queue.submit([commands.finish()]); this.dispatches++;
            await this.readback.mapAsync(GPUMapMode.READ);
            const words = new Uint32Array(this.readback.getMappedRange().slice(0));
            this.readbackBytes += words.byteLength;
            result = decodeResidentResult(l, words, budget, startTicks);
        } catch (e) { error = e; }
        finally { if (this.readback.mapState === 'mapped') this.readback.unmap(); }
        try {
            const oom = await d.popErrorScope(), validation = await d.popErrorScope();
            if (error) throw error; if (oom || validation) throw new Error((oom || validation).message); if (this.failure) throw this.failure;
            if (revision !== s.revision || memoryRevision !== s.memoryRevision || startTicks !== s.ticks) throw new Error('Simulator mirror was edited during GPU execution');
            // Install only fully validated data. The GPU is the forward executor;
            // these are state transfers and history records, not CPU gate results.
            for (const journal of result.journals) {
                for (const w of journal.writes) s.memories[w.mi].values.set(w.data, w.offset);
                if (s.historyLimit) { s.history.push(journal); if (s.history.length > s.historyLimit) s.history.shift(); }
            }
            if (result.journals.some(j => j.writes.length)) s.memoryRevision++;
            this.uploadedMemoryRevision = s.memoryRevision;
            s.values.set(result.values); s.ticks += result.executed;
            s.dirty.fill(0); for (const queue of s.queues) queue.length = 0;
            s.firstDirtyLevel = Infinity; s.lastDirtyLevel = -1;
            s.roots.forEach((pin, i) => s.lastRoots[i] = s.values[pin]);
            s.revision++; this.uploadedRevision = s.revision;
            this.evaluations += (result.executed + 1) * l.plan.gates.length;
            return { executed: result.executed, reason: result.reason, ticks: s.ticks, samples: result.samples };
        } catch (e) { this.invalidate(); throw e; }
        finally { this.busy = false; }
    }
    async clock() { await this.run(1, { stop: false }); return this.simulator.ticks; }
    stats() { return { backend: this.backend, batchCapacity: this.batchCapacity, dispatches: this.dispatches,
        evaluations: this.evaluations, uploadedBytes: this.uploadedBytes, readbackBytes: this.readbackBytes, gatesPerSettle: this.layout.plan.gates.length,
        scheduleLevels: this.layout.schedule.levels.length, addressGates: this.layout.schedule.beforeGates, adapter: this.adapter ?? null }; }
    dispose() {
        this.failure = new Error('Resident GPU engine disposed');
        for (const resource of this.resources) resource.destroy(); this.resources.length = 0; this.device.destroy();
    }
}
