import {test} from 'node:test';import assert from 'node:assert/strict';
import {MixedSignalSimulator} from '../packages/hardware-sim/mixed.js';import {hardwareExamples} from '../packages/hardware-sim/examples.js';
const example=()=>JSON.parse(hardwareExamples().find(e=>e.kind==='mixed').source);
test('physical BJT voltage drives a sampled flip-flop through explicit converters',()=>{
 const s=new MixedSignalSimulator(example());
 s.step(1e-5);assert.ok(s.electrical.voltage('out')>2);assert.equal(s.digital.read('sample'),1n);assert.equal(s.digital.read('drive'),1n);
 s.step(1e-5);assert.ok(s.electrical.voltage('out')<.8);assert.equal(s.digital.read('sample'),0n);assert.equal(s.digital.read('drive'),0n);
});
test('mixed reverse and snapshot restore both continuous and discrete storage',()=>{
 const s=new MixedSignalSimulator(example());s.step(1e-5);const snap=s.snapshot();s.step(1e-5);const final=s.snapshot();s.back();assert.deepEqual(s.snapshot(),snap);
 const other=new MixedSignalSimulator(example());other.restore(snap);other.step(1e-5);assert.deepEqual(other.snapshot(),final);
 const bad=structuredClone(snap);bad.electrical.state[0]=NaN;assert.throws(()=>s.restore(bad));assert.deepEqual(s.snapshot(),snap);
});
test('an indeterminate digital driver never becomes an invented analog voltage',()=>{
 const s=new MixedSignalSimulator(example());s.digital.values[s.digital.plan.outputs.drive[0]]=2;s.digital.settle();const before=s.snapshot();assert.throws(()=>s.step(1e-5),/X\/Z/);assert.deepEqual(s.snapshot(),before);
});
test('mixed simulation enforces converter and snapshot resource boundaries',()=>{
 const e=example();e.adc.push({...e.adc[0]});assert.throws(()=>new MixedSignalSimulator(e),/unique/);
 assert.equal(new MixedSignalSimulator(example(),{historyBytes:0}).historyLimit,0);
});
