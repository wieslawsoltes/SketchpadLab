import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
import {DigitalSimulator,flopValue} from '../packages/hardware-sim/digital.js';
import {logicGate} from '../packages/hardware-sim/logic.js';

test('packed schedules and CSR dirty propagation match full four-state evaluation',()=>{
 let seed=128314;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const b=new NetlistBuilder('packed schedule parity'),input=b.input('input',12),regs=Array.from({length:8},(_,i)=>b.register('r'+i,1,BigInt(i&1)));
 const pins=[b.zero,b.one,...input,...regs.flatMap(r=>r.q)];
 for(let i=0;i<256;i++)pins.push(b.gate(random(11),pins[random(pins.length)],pins[random(pins.length)],pins[random(pins.length)]));
 for(const r of regs)r.connect([pins[random(pins.length)]],input[5],input[6]);
 b.ram('RAM',{width:8,depth:16,address:input.slice(0,4),data:pins.slice(-8),write:input[4],readonly:[[8,9]]});
 const s=new DigitalSimulator(b.compile()),p=s.plan;
 p.gates.forEach((g,i)=>assert.deepEqual(Array.from(s.gateWords.slice(i*5,i*5+5)),[g.op*64,g.a,g.b,g.c,g.q]));
 p.fanout.forEach((edges,i)=>assert.deepEqual(Array.from(s.fanoutTargets.slice(s.fanoutOffsets[i],s.fanoutOffsets[i+1])),edges));
 const values=s.values.slice(),memory=s.memories[0].values.slice(),m=p.memories[0];
 const propagate=()=>{for(const i of p.order){const g=p.gates[i];values[g.q]=logicGate(g.op,values[g.a],values[g.b],values[g.c]);}};
 const address=()=>m.address.reduce((a,pin,i)=>a+(values[pin]<<i),0);
 const settle=()=>{propagate();const at=address()*8;m.read.forEach((pin,i)=>values[pin]=memory[at+i]);propagate();};
 for(let step=0;step<160;step++){
  input.forEach((pin,i)=>values[pin]=s.values[pin]=random(i<5?2:4));s.settle();settle();assert.deepEqual(s.values,values);
  const flops=p.flops.map(f=>flopValue(values,f)),a=address();
  if(values[m.write]===1&&!m.readonly.some(([lo,hi])=>a>=lo&&a<=hi))memory.set(m.data.map(pin=>values[pin]),a*8);
  p.flops.forEach((f,i)=>values[f.q]=flops[i]);settle();s.clock();
  assert.deepEqual(s.values,values,'clock '+step);assert.deepEqual(s.memories[0].values,memory);
 }
});
