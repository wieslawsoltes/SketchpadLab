import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebGPUGateEvaluator,GPUClockedSimulator,GATE_SHADER} from '../packages/hardware-sim/webgpu.js';
import {DigitalSimulator} from '../packages/hardware-sim/digital.js';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
import {logicGate,Gate} from '../packages/hardware-sim/logic.js';
// Test the host/storage orchestration without claiming GPU execution. Browser
// coverage separately compiles WGSL and executes it when an adapter is available.
class MockEvaluator {
 constructor(plan){this.plan=plan;this.calls=0;this.failAt=-1;this.disposed=false;}
 async evaluate(input){this.calls++;if(this.calls===this.failAt)throw new Error('injected GPU failure');const v=input.slice();
  for(const i of this.plan.order){const g=this.plan.gates[i];v[g.q]=logicGate(g.op,v[g.a],v[g.b],v[g.c]);}return v;}
 dispose(){this.disposed=true;}
}
function plan(){const b=new NetlistBuilder('gpu storage'),r=b.register('count',4),w=b.input('write',1,1n);
 r.connect(b.add(r.q,b.constant(1,4)).sum);const memory=b.ram('RAM',{width:4,depth:16,address:r.q,data:b.bits(Gate.NOT,r.q),write:w[0]});
 b.output('count',r.q);b.output('data',memory);return b.compile();}
test('WebGPU unavailability is explicit, never a hidden CPU backend',async()=>{
 const p=plan();await assert.rejects(WebGPUGateEvaluator.create(p,{gpu:null}),/unavailable/);
 await assert.rejects(WebGPUGateEvaluator.create(p,{gpu:{requestAdapter:async()=>null}}),/adapter/);
});
test('GPU clock storage protocol agrees with CPU storage and supports reverse',async()=>{
 const p=plan(),cpu=new DigitalSimulator(p),s=new DigitalSimulator(p),mock=new MockEvaluator(p),gpu=new GPUClockedSimulator(s,mock);
 for(let i=0;i<24;i++){cpu.clock();await gpu.clock();assert.deepEqual(s.snapshot(),cpu.snapshot());}
 cpu.back();s.back();assert.deepEqual(s.snapshot(),cpu.snapshot());await gpu.clock();cpu.clock();assert.deepEqual(s.snapshot(),cpu.snapshot());gpu.dispose();assert.ok(mock.disposed);
});
test('failed post-commit GPU evaluation rolls back RAM, registers, ticks and journal',async()=>{
 const p=plan(),s=new DigitalSimulator(p),mock=new MockEvaluator(p),gpu=new GPUClockedSimulator(s,mock);
 await gpu.clock();const state=s.snapshot(),history=structuredClone(s.history);mock.failAt=mock.calls+3;
 await assert.rejects(gpu.clock(),/injected/);assert.deepEqual(s.snapshot(),state);assert.deepEqual(s.history,history);assert.equal(gpu.busy,false);
});
test('concurrent GPU clocks are rejected rather than racing shared storage',async()=>{
 const p=plan(),s=new DigitalSimulator(p),mock=new MockEvaluator(p),gpu=new GPUClockedSimulator(s,mock);
 const first=gpu.clock();await assert.rejects(gpu.clock(),/Concurrent/);await first;assert.equal(s.ticks,1);
});
test('GPU orchestration rejects indeterminate memory controls atomically',async()=>{
 const p=plan(),s=new DigitalSimulator(p),mock=new MockEvaluator(p),gpu=new GPUClockedSimulator(s,mock);
 s.values[p.inputs.write[0]]=2;s.settle();const before=s.snapshot();await assert.rejects(gpu.clock(),/Indeterminate/);assert.deepEqual(s.snapshot(),before);
});
test('WGSL has explicit dependency dispatch indexing and excludes irrelevant pin reads',()=>{
 assert.match(GATE_SHADER,/span.start\+id.x/);assert.match(GATE_SHADER,/if \(g.op >= 2u\)/);assert.match(GATE_SHADER,/if \(g.op == 8u\)/);
 assert.doesNotMatch(GATE_SHADER,/workgroupBarrier\(/);
});
