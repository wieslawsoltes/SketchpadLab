import { importNetlist, flopValue } from './digital.js';
import { TRUTH_TABLE } from './logic.js';
/** Each dispatch contains a single dependency level. Storage visibility between
 * dispatches is supplied by WebGPU; workgroupBarrier cannot synchronize workgroups.
 * The CPU is responsible for storage boundaries, not for evaluating these gates. */
export const GATE_SHADER = `
struct GateEntry { op:u32, a:u32, b:u32, c:u32, q:u32, delay:u32 }
struct Range { start:u32, count:u32, padding0:u32, padding1:u32 }
@group(0) @binding(0) var<storage,read> gates:array<GateEntry>;
@group(0) @binding(1) var<storage,read_write> signals:array<u32>;
@group(0) @binding(2) var<storage,read> truth:array<u32>;
@group(0) @binding(3) var<uniform> span:Range;
@compute @workgroup_size(64)
fn evaluate(@builtin(global_invocation_id) id:vec3<u32>) {
    if (id.x >= span.count) { return; }
    let g=gates[span.start+id.x];
    var bv=0u; var cv=0u;
    // Do not read unused pins: even an ignored read can cause a data race.
    if (g.op >= 2u) { bv=signals[g.b]; }
    if (g.op == 8u) { cv=signals[g.c]; }
    signals[g.q]=truth[g.op*64u+signals[g.a]+4u*bv+16u*cv];
}`;
export class WebGPUGateEvaluator {
    static async create(plan,{gpu=globalThis.navigator?.gpu}={}) {
        if(!gpu)throw new Error('WebGPU is unavailable; explicitly select CPU gates');
        const adapter=await gpu.requestAdapter();if(!adapter)throw new Error('No WebGPU adapter is available');
        const device=await adapter.requestDevice();let engine;
        try{engine=new WebGPUGateEvaluator(plan,device);await engine.initialize();return engine;}
        catch(error){if(engine)engine.dispose();else device.destroy();throw error;}
    }
    constructor(plan,device) {
        this.plan=importNetlist(plan);if(this.plan.cyclic)throw new Error('GPU level backend does not support combinational loops');
        this.device=device;this.resources=[];this.failure=null;this.busy=false;this.evaluations=0;this.dispatches=0;
        this.device.lost.then(info=>{this.failure=new Error(`WebGPU device lost: ${info.message||info.reason}`);});
    }
    async initialize() {
        const d=this.device,U=globalThis.GPUBufferUsage;
        if(!U)throw new Error('WebGPU buffer API is unavailable');
        d.pushErrorScope('validation');
        let thrown=null;
        try{
            const create=(label,size,usage,data)=>{
                if(size>d.limits.maxBufferSize||size>d.limits.maxStorageBufferBindingSize)throw new Error(`${label} exceeds adapter buffer limits`);
                const buffer=d.createBuffer({label,size:Math.max(4,size),usage});this.resources.push(buffer);
                if(data?.byteLength)d.queue.writeBuffer(buffer,0,data);return buffer;
            };
            const gates=Uint32Array.from(this.plan.order.flatMap(i=>{const g=this.plan.gates[i];return[g.op,g.a,g.b,g.c,g.q,g.delay];}));
            this.byteLength=this.plan.names.length*4;
            this.gates=create('structural gates',Math.max(24,gates.byteLength),U.STORAGE|U.COPY_DST,gates);
            this.signals=create('four-state wires',this.byteLength,U.STORAGE|U.COPY_DST|U.COPY_SRC);
            this.truth=create('shared four-state truth table',TRUTH_TABLE.byteLength,U.STORAGE|U.COPY_DST,TRUTH_TABLE);
            this.readback=create('wire readback',this.byteLength,U.MAP_READ|U.COPY_DST);
            this.stride=Math.max(16,d.limits.minUniformBufferOffsetAlignment);
            const parameters=new Uint32Array(Math.max(1,this.plan.levels.length)*this.stride/4);let offset=0;
            this.plan.levels.forEach((level,i)=>{parameters[i*this.stride/4]=offset;parameters[i*this.stride/4+1]=level.length;offset+=level.length;});
            this.parameters=create('immutable level ranges',parameters.byteLength,U.UNIFORM|U.COPY_DST,parameters);
            const module=d.createShaderModule({label:'four-state structural gate evaluator',code:GATE_SHADER});
            const messages=await module.getCompilationInfo();const errors=messages.messages.filter(m=>m.type==='error');
            if(errors.length)throw new Error(errors.map(e=>`${e.lineNum}:${e.linePos} ${e.message}`).join('\n'));
            const layout=d.createBindGroupLayout({entries:[
                {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
                {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
                {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
                {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',hasDynamicOffset:true,minBindingSize:16}}]});
            this.pipeline=await d.createComputePipelineAsync({layout:d.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module,entryPoint:'evaluate'}});
            this.bind=d.createBindGroup({layout,entries:[{binding:0,resource:{buffer:this.gates}},{binding:1,resource:{buffer:this.signals}},
                {binding:2,resource:{buffer:this.truth}},{binding:3,resource:{buffer:this.parameters,offset:0,size:16}}]});
        }catch(error){thrown=error;}
        const validation=await d.popErrorScope();if(thrown)throw thrown;if(validation)throw new Error(validation.message);
        if(this.failure)throw this.failure;
    }
    async evaluate(values) {
        if(this.failure)throw this.failure;if(this.busy)throw new Error('Concurrent GPU evaluation is not allowed');
        if(!(values instanceof Uint32Array)||values.length!==this.plan.names.length||values.some(v=>v>3)||values[0]!==0||values[1]!==1)throw new Error('Invalid four-state wire buffer');
        this.busy=true;const d=this.device;d.pushErrorScope('validation');let thrown=null,result;
        try{
            d.queue.writeBuffer(this.signals,0,values);
            const encoder=d.createCommandEncoder({label:'levelized gate evaluation'}),pass=encoder.beginComputePass();pass.setPipeline(this.pipeline);
            this.plan.levels.forEach((level,i)=>{
                pass.setBindGroup(0,this.bind,[i*this.stride]);pass.dispatchWorkgroups(Math.ceil(level.length/64));
            });pass.end();encoder.copyBufferToBuffer(this.signals,0,this.readback,0,this.byteLength);d.queue.submit([encoder.finish()]);
            await this.readback.mapAsync(GPUMapMode.READ);result=new Uint32Array(this.readback.getMappedRange().slice(0));
        }catch(error){thrown=error;}
        finally{if(this.readback.mapState==='mapped')this.readback.unmap();}
        let validation;try{validation=await d.popErrorScope();}finally{this.busy=false;}
        if(thrown)throw thrown;if(validation)throw new Error(validation.message);if(this.failure)throw this.failure;
        this.evaluations+=this.plan.gates.length;this.dispatches+=this.plan.levels.length;return result;
    }
    dispose(){this.failure=new Error('GPU evaluator disposed');for(const resource of this.resources)resource.destroy();this.resources=[];this.device.destroy();}
}
/** GPU combinational evaluation with explicit host flip-flop/RAM boundaries.
 * No instruction interpreter is called. Reverse journals use the CPU engine's
 * storage format; a GPU fault restores storage and is never silently continued. */
export class GPUClockedSimulator {
    static async create(simulator,options) {
        const evaluator=await WebGPUGateEvaluator.create(simulator.plan,options);
        return new GPUClockedSimulator(simulator,evaluator);
    }
    constructor(simulator,evaluator){this.simulator=simulator;this.evaluator=evaluator;this.busy=false;}
    async settle(){
        const s=this.simulator;s.values.set(await this.evaluator.evaluate(s.values));
        for(const m of s.memories){const address=s._address(m);for(let bit=0;bit<m.width;bit++)s.values[m.read[bit]]=address<0?2:m.values[address*m.width+bit];}
        if(s.memories.length)s.values.set(await this.evaluator.evaluate(s.values));
        s.roots.forEach((pin,i)=>s.lastRoots[i]=s.values[pin]);
    }
    async clock(){
        if(this.busy)throw new Error('Concurrent GPU clocks are not allowed');this.busy=true;
        const s=this.simulator,previousHistory=[...s.history];let journal=null;
        try{
            if(!Number.isSafeInteger(s.ticks+1))throw new Error('Clock overflow');await this.settle();const writes=[];
            for(let mi=0;mi<s.memories.length;mi++){
                const m=s.memories[mi],enable=s.values[m.write];if(enable===0)continue;
                if(enable!==1)throw new Error('Indeterminate RAM write-enable');const address=s._address(m);
                if(address<0)throw new Error('Indeterminate RAM write address');if(m.readonly.some(([lo,hi])=>address>=lo&&address<=hi))continue;
                const offset=address*m.width;writes.push({mi,offset,old:m.values.slice(offset,offset+m.width),data:m.data.map(p=>s.values[p])});
            }
            journal={ticks:s.ticks,roots:Uint32Array.from(s.roots,pin=>s.values[pin]),writes};
            s.plan.flops.forEach((f,i)=>s.nextFlops[i]=flopValue(s.values,f));
            for(const w of writes)s.memories[w.mi].values.set(w.data,w.offset);
            s.plan.flops.forEach((f,i)=>s.values[f.q]=s.nextFlops[i]);s.ticks++;
            await this.settle();
            if(s.historyLimit){s.history.push(journal);if(s.history.length>s.historyLimit)s.history.shift();}
            return s.ticks;
        }catch(error){
            if(journal){s.roots.forEach((p,i)=>s.values[p]=journal.roots[i]);s.ticks=journal.ticks;for(const w of journal.writes)s.memories[w.mi].values.set(w.old,w.offset);}
            s.history=previousHistory;s._invalidate();s.settle();throw error;
        }finally{this.busy=false;}
    }
    dispose(){this.evaluator.dispose();}
}
