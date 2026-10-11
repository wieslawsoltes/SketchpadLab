import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HardwareSession} from '../packages/hardware-sim/session.js';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
import {Waveform} from '../packages/hardware-sim/digital.js';

function counter(){const b=new NetlistBuilder('batched session fixture'),q=b.register('count',8);
 q.connect(b.add(q.q,b.constant(1,8)).sum);b.output('count',q.q);return b.compile();}
// Host-only orchestration fixture: this is not counted as shader validation.
// tests/resident-gpu.js separately executes the real backend in Chromium.
class BatchFixture {
 constructor(s,probes){this.simulator=s;this.probes=probes;this.backend='webgpu-resident';this.batchCapacity=4;this.calls=[];}
 async run(budget,options){this.calls.push({budget,...options});const wave=new Waveform(this.simulator.plan,this.probes);
  for(let i=0;i<budget;i++){this.simulator.clock();wave.capture(this.simulator);}
  return {executed:budget,reason:'budget',ticks:this.simulator.ticks,samples:wave.samples};}
 stats(){return {backend:this.backend,batchCapacity:4,dispatches:this.calls.length,evaluations:0,uploadedBytes:0,readbackBytes:0,adapter:null};}
 dispose(){}
}
test('resident session batching respects budgets and installs every clock sample',async()=>{
 const plan=counter(),s=new HardwareSession(),reference=new HardwareSession();
 await s.load({kind:'netlist',source:JSON.stringify(plan)});await reference.load({kind:'netlist',source:JSON.stringify(plan)});
 s.gpu=new BatchFixture(s.simulator,s.probes);
 await s.advance({budget:11});await reference.advance({budget:11});
 assert.deepEqual(s.gpu.calls.map(c=>c.budget),[4,4,3]);assert.equal(s.exportTrace(),reference.exportTrace());
 assert.deepEqual(s.simulator.snapshot(),reference.simulator.snapshot());assert.equal(s.summary().lastRun.executed,11);
 assert.equal(s.summary().backend,'webgpu-resident');assert.equal(s.summary().gpu.dispatches,3);
 await s.advance({operation:'clock'});assert.equal(s.simulator.ticks,12);assert.equal(s.gpu.calls.at(-1).budget,1);
 s.back();assert.equal(s.exportTrace(),reference.exportTrace());
});
test('resident unavailable and non-digital selections leave the previous model unchanged',async()=>{
 const s=new HardwareSession();await s.load({kind:'netlist',source:JSON.stringify(counter())});const before=s.exportSnapshot();
 await assert.rejects(s.load({kind:'electrical',backend:'webgpu-resident',source:'{}'}),/WebGPU/);
 assert.equal(s.exportSnapshot(),before);
 await assert.rejects(s.load({kind:'netlist',backend:'webgpu-resident',source:JSON.stringify(counter())}),/unavailable/);
 assert.equal(s.exportSnapshot(),before);assert.equal(s.busy,false);
});
test('waveform append copies and validates samples before changing the trace',()=>{
 const wave=new Waveform(counter(),['count'],{limit:2}),sample={tick:1,bits:['00000001']};wave.append(sample);sample.bits[0]='00000010';
 assert.equal(wave.samples[0].bits[0],'00000001');
 for(const bad of [{tick:-1,bits:['00000000']},{tick:2,bits:['7']},{tick:2,bits:['0000000?']},{tick:2,bits:[]}])assert.throws(()=>wave.append(bad));
 assert.equal(wave.samples.length,1);wave.append({tick:2,bits:['00000010']});wave.append({tick:3,bits:['00000011']});
 assert.equal(wave.dropped,1);wave.append({tick:2,bits:['xxxxxxxx']});assert.deepEqual(wave.samples,[{tick:2,bits:['xxxxxxxx']}]);
});
