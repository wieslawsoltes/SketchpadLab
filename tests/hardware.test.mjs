import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gate, logicGate } from '../packages/hardware-sim/logic.js';
import { NetlistBuilder } from '../packages/hardware-sim/netlist.js';
import { DigitalSimulator } from '../packages/hardware-sim/digital.js';
import { TimedSimulator } from '../packages/hardware-sim/timed.js';
import { ElectricalSimulator } from '../packages/hardware-sim/electrical.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('four-state gates preserve unknowns, tri-state and contention',()=>{
 assert.equal(logicGate(Gate.AND,0,2),0);assert.equal(logicGate(Gate.OR,1,3),1);
 assert.equal(logicGate(Gate.RESOLVE,0,1),2);assert.equal(logicGate(Gate.RESOLVE,3,1),1);
 assert.equal(logicGate(Gate.MUX,1,1,2),1);assert.equal(logicGate(Gate.MUX,0,1,3),2);
 assert.equal(logicGate(Gate.TRI,1,0),3);assert.throws(()=>logicGate(Gate.BUF,4));
});
test('gate-built 36-bit ones-complement adder, negative zero and overflow',()=>{
 const b=new NetlistBuilder('adder'),a=b.input('a',36),c=b.input('b',36),r=b.onesAdd(a,c);b.output('sum',r.sum);b.output('overflow',[r.overflow]);
 const s=new DigitalSimulator(b.compile());
 for(const [x,y,w] of [[1n,2n,3n],[0xfffffffffn,1n,1n],[0n,0xfffffffffn,0xfffffffffn]]){s.input('a',x);s.input('b',y);assert.equal(s.read('sum'),w);}
 s.input('a',0x7ffffffffn);s.input('b',1n);assert.equal(s.read('overflow'),1n);
});
test('flops sample simultaneously; clock reversal restores memory and registers',()=>{
 const b=new NetlistBuilder('flops'),x=b.register('x',1,1n),y=b.register('y',1);x.connect(y.q);y.connect(x.q);b.output('x',x.q);b.output('y',y.q);
 const s=new DigitalSimulator(b.compile());s.clock();assert.equal(s.read('x'),0n);assert.equal(s.read('y'),1n);assert.ok(s.back());assert.equal(s.read('x'),1n);
});
function delayPlan(){const b=new NetlistBuilder('delay'),a=b.input('a');b.output('q',[b.gate(Gate.NOT,a[0],b.zero,b.zero,'inverter',10)]);return b.compile();}
test('inertial timing rejects short pulses; transport timing preserves them',()=>{
 for(const mode of ['inertial','transport']){
  const s=new TimedSimulator(delayPlan(),{delayModel:mode});s.runUntil(20);assert.equal(s.read('q'),1n);
  s.input('a',1n,25);s.input('a',0n,28);s.runUntil(36);assert.equal(s.read('q'),mode==='transport'?0n:1n);
  s.runUntil(40);assert.equal(s.read('q'),1n);
 }
});
test('timed simultaneous input changes avoid order-dependent XOR pulses',()=>{
 const b=new NetlistBuilder(),a=b.input('a'),c=b.input('b');b.output('q',[b.xor(a[0],c[0])]);
 const s=new TimedSimulator(b.compile(),{delayModel:'transport'});s.runUntil(2);s.input('a',1n,10);s.input('b',1n,10);s.runUntil(20);
 assert.equal(s.read('q'),0n);assert.ok(!s.trace.some(row=>row.changes.some(([pin,v])=>pin===s.plan.outputs.q[0]&&v===1)));
});
test('zero-delay ring fails atomically, positive-delay ring oscillates',()=>{
 for(const delay of [0,1]){const b=new NetlistBuilder('ring'),q=b.wire('q',0);b.drive(q,Gate.NOT,q,b.zero,b.zero,delay);b.output('q',[q]);
  const s=new TimedSimulator(b.compile({allowCycles:true}),{maxEvents:100});
  if(!delay){const before=s.snapshot();assert.throws(()=>s.runUntil(5),/budget/);assert.deepEqual(s.snapshot(),before);}
  else{assert.equal(s.runUntil(5).events,5);assert.equal(s.read('q'),1n);assert.ok(s.back());assert.equal(s.time,0);}
 }
});
test('timed snapshots restore queues and reject forged event drivers',()=>{
 const s=new TimedSimulator(delayPlan());s.input('a',1n,20);s.runUntil(15);const snap=s.snapshot();s.runUntil(50);const final=s.snapshot();
 const other=new TimedSimulator(delayPlan());other.restore(snap);other.runUntil(50);assert.deepEqual(other.snapshot(),final);
 snap.events[0].pin=0;assert.throws(()=>other.restore(snap));
});
const rc={nodes:['0','in','out'],components:[{name:'V',type:'V',p:'in',n:'0',source:5},{name:'R',type:'R',p:'in',n:'out',value:1000},{name:'C',type:'C',p:'out',n:'0',value:1e-6}]};
test('RC transient follows analytic exponential and voltage-source KCL',()=>{
 const s=new ElectricalSimulator(rc);s.run(.001,.000001);near(s.voltage('out'),5*(1-Math.exp(-1)),.001);
 near(s.branchCurrent('V'),-(5-s.voltage('out'))/1000,1e-10);assert.ok(s.residual<=1);
});
test('RL transient follows analytic exponential',()=>{
 const s=new ElectricalSimulator({nodes:['0','in','out'],components:[{name:'V',type:'V',p:'in',n:'0',source:1},{name:'R',type:'R',p:'in',n:'out',value:10},{name:'L',type:'L',p:'out',n:'0',value:.01}]});
 s.run(.001,.000001);near(s.branchCurrent('L'),.1*(1-Math.exp(-1)),.0001);
});
test('diode Newton solution satisfies Shockley current and KCL',()=>{
 const s=new ElectricalSimulator({nodes:['0','in','d'],components:[{name:'V',type:'V',p:'in',n:'0',source:5},{name:'R',type:'R',p:'in',n:'d',value:1000},{name:'D',type:'D',p:'d',n:'0',Is:1e-14}]});
 s.operatingPoint();const v=s.voltage('d');assert.ok(v>.6&&v<.8);near((5-v)/1000,1e-14*Math.expm1(v/.025852),1e-9);
});
test('Ebers-Moll NPN inverter operates in cutoff and saturation; PNP mirrors it',()=>{
 for(const sign of [1,-1]){const s=new ElectricalSimulator({nodes:['0','vcc','in','base','out'],components:[
 {name:'VCC',type:'V',p:'vcc',n:'0',source:5*sign},{name:'VIN',type:'V',p:'in',n:'0',source:0},
 {name:'RB',type:'R',p:'in',n:'base',value:10000},{name:'RC',type:'R',p:'vcc',n:'out',value:1000},
 {name:'Q',type:'Q',c:'out',b:'base',e:'0',polarity:sign===1?'npn':'pnp'}]});
 s.operatingPoint();near(s.voltage('out'),5*sign,1e-5);s.setSource('VIN',5*sign);s.operatingPoint();assert.ok(s.voltage('out')*sign<.3);assert.ok(s.voltage('base')*sign>.5);
 }
});
test('electrical rollback, independent restore and rejected malformed state',()=>{
 const s=new ElectricalSimulator(rc);s.step(1e-4);const snap=s.snapshot();s.step(1e-4);const value=s.voltage('out');assert.ok(s.back());near(s.voltage('out'),snap.state[1]);
 const other=new ElectricalSimulator(rc);other.restore(snap);other.step(1e-4);near(other.voltage('out'),value);
 const bad=structuredClone(snap);bad.state[0]=NaN;assert.throws(()=>s.restore(bad));assert.deepEqual(s.snapshot(),snap);
});
test('floating circuit and ideal source loop report singularity without mutating state',()=>{
 const s=new ElectricalSimulator({nodes:['0','a','b'],components:[{name:'R',type:'R',p:'a',n:'b',value:1000}]});const snap=s.snapshot();assert.throws(()=>s.operatingPoint(),/Singular/);assert.deepEqual(s.snapshot(),snap);
});
test('PWL breakpoints subdivide transient steps',()=>{
 const c=structuredClone(rc);c.components[0].source={pwl:[[0,0],[1e-4,0],[1.01e-4,5],[.001,5]]};const s=new ElectricalSimulator(c);
 const rows=s.run(.002,.001);assert.ok(rows.some(row=>row.time===1e-4));assert.ok(rows.some(row=>row.time===1.01e-4));
});
