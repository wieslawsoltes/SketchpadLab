import {test} from 'node:test';import assert from 'node:assert/strict';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
import {DigitalSimulator} from '../packages/hardware-sim/digital.js';
import {exchangeCircuit,indexedAddressCircuit} from '../packages/hardware-sim/circuits.js';
import {TX2GateBoard,BOARD_OPERATIONS} from '../packages/hardware-sim/tx2-board.js';
import {exchangeLoad,exchangeLoadWithoutSignExtension,exchangeStore} from '../packages/tx2-core/exchange.js';
import {encodeInstruction,OPCODES} from '../packages/tx2-core/instruction.js';
import {TX2} from '../packages/tx2-core/cpu.js';
import {assemble} from '../packages/tx2-assembler/index.js';
let random=123456789n;const rand=()=>{random=(random*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);return random&((1n<<36n)-1n);};
test('structural exchanger agrees with reference in all 512 configurations, both directions',()=>{
 const b=new NetlistBuilder('exchange'),cfg=b.input('cfg',9),m=b.input('m',36),e=b.input('e',36);
 b.output('load',exchangeCircuit(b,cfg,m,e));b.output('noSign',exchangeCircuit(b,cfg,m,e,{signExtend:false}));b.output('store',exchangeCircuit(b,cfg,m,e,{store:true}));
 const s=new DigitalSimulator(b.compile());
 for(let c=0;c<512;c++)for(let n=0;n<3;n++){const x=rand(),y=rand();s.input('m',x);s.input('e',y);s.input('cfg',BigInt(c));
 assert.equal(s.read('load'),exchangeLoad(c,x,y),`load ${c}`);assert.equal(s.read('noSign'),exchangeLoadWithoutSignExtension(c,x,y));assert.equal(s.read('store'),exchangeStore(c,x,y));}
});
test('gate indexing canonicalizes negative zero and wraps at 17 bits',()=>{
 const b=new NetlistBuilder(),a=b.input('a',17),x=b.input('x',18);b.output('result',indexedAddressCircuit(b,a,x));const s=new DigitalSimulator(b.compile());
 for(const [address,index,want]of [[4,0o777773,0],[0,0o777777,0],[0o377777,1,0],[0,0o777776,0o377777]]){s.input('a',BigInt(address));s.input('x',BigInt(index));assert.equal(s.read('result'),BigInt(want));}
});
function compare(board,cpu){const s=board.state();for(const n of 'ABCDE')assert.equal(s[n],cpu.getRegister(n),n);
 assert.equal(s.P,BigInt(cpu.P),'P');assert.equal(s.Q,BigInt(cpu.Q),'Q');assert.equal(s.N,cpu.N,'N');
 assert.equal(s.Z,BigInt(cpu.overflowFlags),'Z');for(let i=0;i<64;i++)assert.equal(board.simulator.read('X'+i),cpu.X[i],'X'+i);
 for(let i=0;i<32;i++)assert.equal(board.simulator.read('F'+i),BigInt(cpu.F[i]),'F'+i);}
test('all 37 implemented gate-board opcodes match instruction reference on basic operands',()=>{
 assert.equal(BOARD_OPERATIONS.length,37);
 // One reusable circuit avoids hiding per-operation behavior in board construction.
 const image={entry:0o100,words:[[0o100,encodeInstruction({op:'LDA',address:0o200})],[0o200,1963n]]};
 const board=new TX2GateBoard(image),cpu=new TX2();
 for(const op of BOARD_OPERATIONS){
  const instruction=encodeInstruction({op,address:op==='JMP'?0o120:0o200,index:op==='SKM'?0o21:op==='SKX'?1:0});
  const code={entry:0o100,words:[[0o100,instruction],[0o200,1963n]]};cpu.load(code);
  board.simulator.reset({clearMemory:true});board.simulator.poke('STUV',0o100,instruction);board.simulator.poke('STUV',0o200,1963n);
  const expected=cpu.step();assert.equal(expected.ok,true,op);board.stepInstruction();
  try{compare(board,cpu);if(!['JMP','SKX'].includes(op))assert.equal(board.simulator.peek('STUV',0o200),cpu.memory.peek(0o200));}
  catch(e){e.message=op+': '+e.message;throw e;}
 }
});
test('assembled index loop executes independently and reverses at clock boundaries',()=>{
 const image=assemble('.org 100\nREX_1 3\nLOOP: LDA 200\nADD 201\nSTA 200\nDEX_1 1\nJPX_1 LOOP\n.word 0\n.org 200\n.word 0\n.word 1');
 assert.deepEqual(image.diagnostics,[]);const board=new TX2GateBoard(image),cpu=new TX2();cpu.load(image);
 for(let i=0;i<16;i++){assert.equal(cpu.step().ok,true);board.stepInstruction();compare(board,cpu);}
 const snapshot=board.simulator.snapshot();board.simulator.clock();assert.ok(board.simulator.back());assert.deepEqual(board.simulator.snapshot(),snapshot);
});
test('gate-built RAM executes the same compiled program without RAM macros',()=>{
 const image=assemble('.org 100\nLDA 200\nADD 201\nSTA 202\n.org 200\n.word 0d1963\n.word 0d2026');
 const board=new TX2GateBoard(image,{memory:'gates',depth:256});assert.equal(board.simulator.memories.length,0);
 for(let i=0;i<3;i++)board.stepInstruction();assert.equal(board.state().A,3989n);
 assert.ok(board.simulator.plan.flops.length>256*37);assert.ok(board.simulator.back());
});
test('deferred indexed pointers and memory-mapped register operands match reference',()=>{
 const image=assemble('.org 100\nREX_1 4\nLDA *200\nLDB 377604\nSTA 377605\n.org 200\n.word 0o000001000204\n.org 210\n.word 0d987');
 const board=new TX2GateBoard(image),cpu=new TX2();cpu.load(image);
 for(let i=0;i<4;i++){assert.equal(cpu.step().ok,true);board.stepInstruction();compare(board,cpu);}
 assert.equal(board.state().B,987n);
});
test('fractured gate arithmetic, logic and F-memory updates match reference',()=>{
 const image=assemble('.org 100\nLDA 200\nLDB 201\nLDC 202\nLDD 203\nSPF^1 204\nADD^1 201\nSUB^1 202\nDSA^1 203\nCOM^1 205\nITE^1 200\nINS^1 200\nSED^1 200\nJMP 140\nJMP 140\n.org 140\nFLG^1 210\n.org 200\n.word 0o123456123456\n.word 0o654321654321\n.word 0o004003402401\n.word 0o774773772771\n.word 0o000000000237\n.word 0o123456123456');
 assert.deepEqual(image.diagnostics,[]);const board=new TX2GateBoard(image),cpu=new TX2();cpu.load(image);
 for(let i=0;i<20&&cpu.P!==0o141;i++){assert.equal(cpu.step().ok,true);board.stepInstruction();compare(board,cpu);}assert.equal(cpu.P,0o141);
 for(const address of [0o200,0o205,0o210])assert.equal(board.simulator.peek('STUV',address),cpu.memory.peek(address));
});
test('unsupported operations and sequence controls halt without register/memory writeback',()=>{
 for(const instruction of [encodeInstruction({op:'MUL',address:0o200}),encodeInstruction({op:'JMP',config:0o20,address:0o100})]){
  const board=new TX2GateBoard({entry:0o100,words:[[0o100,instruction],[0o200,42n]]});board.stepInstruction();
  assert.equal(board.state().halt,1n);assert.equal(board.state().retired,0n);assert.equal(board.state().A,0n);assert.equal(board.simulator.peek('STUV',0o200),42n);
 }
});
test('random register, index, activity and fracture states agree for all supported operations',()=>{
 const board=new TX2GateBoard({entry:0o100,words:[[0o100,0n]]}),s=board.simulator,cpu=new TX2();
 const put=(name,value)=>{s.plan.outputs[name].forEach((p,i)=>s.values[p]=Number(value>>BigInt(i)&1n));};
 for(const op of BOARD_OPERATIONS)for(let iteration=0;iteration<8;iteration++){
  const config=op==='SKX'?iteration:op==='JMP'?iteration*2:iteration*4;
  const j=op==='SKM'?iteration*8+iteration:3;
  const instr=encodeInstruction({op,config,index:j,address:0o200}),operand=rand();
  const code={entry:0o100,words:[[0o100,instr],[0o200,operand]]};cpu.load(code);s.reset({clearMemory:true});s.poke('STUV',0o100,instr);s.poke('STUV',0o200,operand);
  // Keep indexing within the mapped memory window while exercising signed values.
  cpu.X[3]=iteration%2?0o777776n:0n;put('X3',cpu.X[3]);
  if(iteration%2){cpu.memory.poke(0o177,operand);s.poke('STUV',0o177,operand);}
  for(const name of 'ABCDE'){const value=rand();cpu.setRegister(name,value);put(name,value);}
  if(config){const value=Number(rand()&511n);cpu.F[config]=value;put('F'+config,BigInt(value));}s.settle();
  const result=cpu.step();assert.equal(result.ok,true,`${op} ${config}: ${JSON.stringify(result.error)}`);board.stepInstruction();
  try{compare(board,cpu);for(const addr of [0o177,0o200])assert.equal(s.peek('STUV',addr),cpu.memory.peek(addr));}
  catch(e){e.message=`${op} config=${config} iteration=${iteration}: ${e.message}`;throw e;}
 }
});
