import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
import {DigitalSimulator} from '../packages/hardware-sim/digital.js';
import {priorityCircuit,sequenceRegisters} from '../packages/hardware-sim/sequences.js';
const write=(s,name,n)=>{s.plan.outputs[name].forEach((p,i)=>s.values[p]=Number(n>>BigInt(i)&1n));s.settle();};
function make(){
 const b=new NetlistBuilder('sequence card'),r=sequenceRegisters(b,0o100),inputs={};
 for(const name of ['boundary','commit','hold','dismiss','raise','lower'])inputs[name]=b.input(name)[0];
 inputs.unit=b.input('unit',6);inputs.events=b.input('events',64);inputs.p=b.input('P',18,0o123456n);
 const keepers=Array.from({length:64},(_,i)=>b.constant(i===0o60?0o400260:0o200+i,18));
 const action=r.connect({...inputs,running:b.one,placekeepers:keepers,trapMode:b.input('trap',12)});
 b.output('nextP',action.targetP);b.output('report',action.report);b.output('sleeping',[action.sleeping]);
 return new DigitalSimulator(b.compile());
}
test('balanced priority circuit picks first asserted request across 33 inputs',()=>{
 const b=new NetlistBuilder(),requests=b.input('r',33),p=priorityCircuit(b,requests,requests.map((_,i)=>b.constant(i,6)));
 b.output('q',p.value);b.output('valid',[p.valid]);const s=new DigitalSimulator(b.compile());
 for(let i=0;i<33;i++){s.input('r',(1n<<33n)-(1n<<BigInt(i)));assert.equal(s.read('q'),BigInt(i));assert.equal(s.read('valid'),1n);}
 s.input('r',0n);assert.equal(s.read('valid'),0n);
});
test('sequence dismissal chooses priority, writes E report and preserves marked keeper',()=>{
 const s=make();s.input('commit',1n);s.input('dismiss',1n);s.input('raise',1n);s.input('unit',0o60n);s.clock();
 s.input('commit',0n);s.input('boundary',1n);assert.equal(s.read('sequenceChange'),1n);
 assert.equal(s.read('nextP'),0o400260n);assert.equal(s.read('report'),(0o60n<<18n)|0o123456n);s.clock();assert.equal(s.read('K'),0o60n);
});
test('HOLD blocks higher-priority preemption, forced dismissal enters LIMBO and wakes',()=>{
 const s=make();write(s,'K',0o60n);write(s,'flags',1n<<0o60n);s.input('commit',1n);s.input('hold',1n);s.clock();
 s.input('commit',0n);s.input('boundary',1n);s.input('events',1n<<0o40n);assert.equal(s.read('sequenceChange'),0n);s.clock();assert.equal(s.read('K'),0o60n);
 s.input('boundary',0n);s.input('events',0n);s.input('commit',1n);s.input('hold',0n);s.clock();s.input('commit',0n);s.input('boundary',1n);s.clock();assert.equal(s.read('K'),0o40n);
 write(s,'flags',0n);s.input('boundary',0n);s.input('commit',1n);s.input('dismiss',1n);s.clock();s.input('commit',0n);s.input('boundary',1n);s.clock();assert.equal(s.read('limbo'),1n);
 s.input('events',1n<<0o60n);s.clock();assert.equal(s.read('limbo'),0n);assert.equal(s.read('K'),0o60n);
});
test('raising the currently dismissed sequence cancels dismissal and retains HOLD',()=>{
 const s=make();s.input('commit',1n);s.input('dismiss',1n);s.input('raise',1n);s.input('hold',1n);s.clock();
 assert.equal(s.read('dismissed'),0n);assert.equal(s.read('previousHold'),1n);assert.equal(s.read('flags'),1n);
});
test('marked placekeeper redirects to TRAP 42 and report retains intended sequence',()=>{
 const s=make();write(s,'flags',1n<<0o60n);write(s,'dismissed',1n);s.input('trap',0o10n);s.input('boundary',1n);
 assert.equal(s.read('sequenceTrap'),1n);assert.equal(s.read('sequenceTarget'),0o42n);assert.equal(s.read('nextP'),0o242n);
 assert.equal(s.read('report'),(0o60n<<18n)|0o123456n);s.clock();assert.equal(s.read('K'),0o42n);assert.ok(s.read('flags')&(1n<<0o42n));
 const snapshot=s.snapshot();s.clock();s.back();assert.deepEqual(s.snapshot(),snapshot);
});
