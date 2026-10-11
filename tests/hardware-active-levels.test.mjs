import {test} from 'node:test';import assert from 'node:assert/strict';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
import {DigitalSimulator} from '../packages/hardware-sim/digital.js';
import {logicGate} from '../packages/hardware-sim/logic.js';
test('active level bounds propagate every late fanout and leave settled networks idle',()=>{
 const b=new NetlistBuilder(),input=b.input('input',5);let out=input;
 for(let i=0;i<800;i++)out=out.map((pin,n)=>b.xor(pin,input[(n+1)%input.length]));
 b.output('out',out);const s=new DigitalSimulator(b.compile());
 for(let i=0;i<32;i++){
  s.input('input',BigInt(i));const expected=s.values.slice();
  for(const j of s.plan.order){const g=s.plan.gates[j];expected[g.q]=logicGate(g.op,expected[g.a],expected[g.b],expected[g.c]);}
  assert.deepEqual(s.values,expected);assert.equal(s.lastDirtyLevel,-1);assert.equal(s.firstDirtyLevel,Infinity);
  const evaluations=s.evaluations;for(let n=0;n<100;n++)s.settle();assert.equal(s.evaluations,evaluations);
 }
 const snapshot=s.snapshot();s.input('input',0n);s.restore(snapshot);assert.deepEqual(s.snapshot(),snapshot);
});
test('empty-gate circuits and sequential RAM boundaries do not need a level zero',()=>{
 const b=new NetlistBuilder(),q=b.register('q',1,1n);q.connect(q.q);b.output('q',q.q);
 const s=new DigitalSimulator(b.compile());s.clock();assert.equal(s.read('q'),1n);assert.equal(s.evaluations,0);s.back();assert.equal(s.ticks,0);
});
