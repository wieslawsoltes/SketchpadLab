import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HardwareSession} from '../packages/hardware-sim/session.js';
import {hardwareExamples} from '../packages/hardware-sim/examples.js';
import {TimedSimulator} from '../packages/hardware-sim/timed.js';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
import {Gate} from '../packages/hardware-sim/logic.js';
const examples=hardwareExamples();
const load=(s,index,options={})=>s.load({...examples[index],extended:false,...options});
test('session is optional, executes independent board, probes connectivity and exports VCD',async()=>{
 const s=new HardwareSession();assert.deepEqual(s.summary(),{powered:false});await load(s,0);
 for(let i=0;i<3;i++)await s.advance({operation:'instruction'});
 assert.equal(s.board.state().A,3989n);assert.equal(s.summary().busy,false);
 const cone=s.inspect('A',0);assert.equal(cone.nodes[0].driver,'DFF');assert.ok(cone.nodes.length>1);assert.ok(cone.nodes.length<=48);
 assert.match(s.exportTrace(),/\$timescale 1 ns/);assert.equal(JSON.parse(s.exportNetlist()).levels,undefined);
 s.dispose();assert.deepEqual(s.summary(),{powered:false});
});
test('failed model loads preserve running circuit state; default remains explicitly selected',async()=>{
 const s=new HardwareSession();await load(s,0);await s.advance({operation:'instruction'});const before=s.exportSnapshot();
 await assert.rejects(s.load({kind:'board',source:'INVALID ^ ???',extended:false}));assert.equal(s.exportSnapshot(),before);
 await assert.rejects(s.load({kind:'electrical',backend:'webgpu',source:'{}'}),/WebGPU/);assert.equal(s.exportSnapshot(),before);
 await assert.rejects(s.load({kind:'board',extended:'yes'}));assert.equal(s.busy,false);
});
test('checkpoint, JSON import and reverse restore matching clocked storage',async()=>{
 const s=new HardwareSession();await load(s,0);await s.advance({operation:'instruction'});s.checkpoint();const snapshot=s.exportSnapshot();
 await s.advance({operation:'instruction'});assert.equal(s.board.state().A,3989n);s.restoreCheckpoint();assert.equal(s.board.state().A,1963n);
 const other=new HardwareSession();await other.restoreSnapshot(snapshot);assert.equal(other.exportSnapshot(),snapshot);
 await other.advance({operation:'clock'});other.back();assert.equal(other.exportSnapshot(),snapshot);
 const bad=JSON.parse(snapshot);bad.state.values[0]=1;const before=other.exportSnapshot();await assert.rejects(other.restoreSnapshot(JSON.stringify(bad)));assert.equal(other.exportSnapshot(),before);
});
test('restoring a snapshot excludes concurrent edits and stepping',async()=>{
 const s=new HardwareSession();await load(s,0);const text=s.exportSnapshot();const restoring=s.restoreSnapshot(text);
 const blockedStep=assert.rejects(s.advance({operation:'clock'}),/busy/);const blockedLoad=assert.rejects(s.load(examples[0]),/Pause/);await Promise.all([blockedStep,blockedLoad,restoring]);
 assert.equal(s.busy,false);
});
test('instruction breakpoints stop at fetch and long runs yield to pause',async()=>{
 const s=new HardwareSession();await load(s,0);const before=s.simulator.ticks;
 const stopped=await s.advance({budget:1000,breakpoint:0o100});assert.equal(stopped.lastRun.reason,'breakpoint');assert.equal(s.simulator.ticks,before);
 let progress=0;const run=await s.advance({budget:100000},()=>{progress++;s.pause();});assert.equal(run.lastRun.reason,'paused');assert.ok(progress>0);assert.ok(run.lastRun.executed<100000);
});
test('timed trace truncation preserves its base state and increasing VCD timestamps',async()=>{
 const b=new NetlistBuilder('ring'),q=b.wire('ring',0);b.drive(q,Gate.NOT,q,b.zero,b.zero,1);b.output('q',[q]);
 const plan=b.compile({allowCycles:true}),d=new TimedSimulator(plan,{traceLimit:2});d.runUntil(8);assert.equal(d.trace.length,2);assert.equal(d.traceBaseTime,6);assert.equal(d.traceBase[q],0);
 const saved=d.snapshot();const restored=new TimedSimulator(plan,{traceLimit:2});restored.restore(saved);assert.deepEqual(restored.snapshot(),saved);
 const s=new HardwareSession();await s.load({kind:'timed',source:JSON.stringify(plan)});s.simulator=d;
 const wave=s.timedWave();assert.deepEqual(wave.samples.map(x=>x.tick),[6,7,8]);assert.deepEqual(wave.samples.map(x=>x.bits[0]),['0','1','0']);
 const bad=structuredClone(saved);bad.traceBase[0]=1;assert.throws(()=>d.restore(bad));
});
test('all physics sessions run in SI/time units and reject incompatible operations',async()=>{
 for(const index of [3,5,6,7]){const s=new HardwareSession();await load(s,index);
  const summary=await s.advance({budget:20,step:1e-6,until:100});assert.equal(summary.busy,false);assert.ok(summary.time>0);
  await assert.rejects(s.advance({operation:'instruction'}),/requires/);
  if(index>=5){const trace=JSON.parse(s.exportTrace());assert.equal(trace.units.time,'seconds');assert.ok(trace.samples.length>1);}
  else assert.match(s.exportTrace(),/\$var wire/);
 }
});
test('electrical operating point and sample history survive session checkpoint and import',async()=>{
 const s=new HardwareSession();await load(s,5);await s.advance({operation:'operatingPoint'});assert.equal(s.summary().electrical.solved,true);s.checkpoint();
 const before=s.exportSnapshot();await s.advance({budget:10});s.restoreCheckpoint();assert.equal(s.exportSnapshot(),before);
 const other=new HardwareSession();await other.restoreSnapshot(before);assert.equal(other.exportSnapshot(),before);
});
