import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assemble} from '../packages/tx2-assembler/index.js';
import {TX2} from '../packages/tx2-core/cpu.js';
import {TX2GateBoard} from '../packages/hardware-sim/tx2-board.js';
test('non-deferred addressing validates the indexed target, not the unused raw address',()=>{
 const image=assemble('.org 100\nREX_1 777776\nLDA_1 1000\n.org 777\n.word 0d2026');
 assert.deepEqual(image.diagnostics,[]);
 const gate=new TX2GateBoard(image,{depth:512}),reference=new TX2();reference.load(image);
 for(let n=0;n<2;n++){assert.equal(reference.step().ok,true);gate.stepInstruction();assert.equal(gate.state().halt,0n);}
 assert.equal(gate.state().A,2026n);assert.equal(gate.state().A,reference.getRegister('A'));
 assert.equal(gate.state().Q,BigInt(reference.Q));
});
test('an indexed address that leaves installed memory still halts before writeback',()=>{
 const image=assemble('.org 100\nREX_1 1\nLDA_1 777');
 const gate=new TX2GateBoard(image,{depth:512});gate.stepInstruction();gate.stepInstruction();
 assert.equal(gate.state().halt,1n);assert.equal(gate.state().retired,1n);assert.equal(gate.state().A,0n);
});
