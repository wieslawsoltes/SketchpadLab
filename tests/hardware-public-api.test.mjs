import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as hardware from '../packages/hardware-sim/index.js';
import {assemble} from '../packages/tx2-assembler/index.js';
test('public hardware entry imports without a DOM or GPU and executes real gates',()=>{
 const {NetlistBuilder,DigitalSimulator,TX2GateBoard}=hardware;
 for(const name of ['TimedSimulator','ElectricalSimulator','MixedSignalSimulator','HardwareSession','GPUClockedSimulator','WebGPUGateEvaluator'])assert.equal(typeof hardware[name],'function',name);
 const builder=new NetlistBuilder('standalone counter'),r=builder.register('count',8);
 r.connect(builder.add(r.q,builder.constant(1,8)).sum);builder.output('count',r.q);
 const sim=new DigitalSimulator(builder.compile());sim.run(259);assert.equal(sim.read('count'),3n);assert.ok(sim.back());assert.equal(sim.read('count'),2n);
 const image=assemble('.org 100\nLDA 200\nADD 201\n.org 200\n.word 0d1963\n.word 0d2026');
 const board=new TX2GateBoard(image,{depth:256});board.stepInstruction();board.stepInstruction();assert.equal(board.state().A,3989n);
});
