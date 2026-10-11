import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TX2GateBoard} from '../packages/hardware-sim/tx2-board.js';
import {assemble,encodeBinaryTape} from '../packages/tx2-assembler/index.js';
import {encodeInstruction} from '../packages/tx2-core/instruction.js';
import {TX2} from '../packages/tx2-core/cpu.js';
import {READER_LEADER_WORDS,STANDARD_CONFIGURATION} from '../packages/tx2-core/index.js';
import {unsplayWord} from '../packages/tx2-core/peripherals.js';
const I=(op,address=0,config=0,index=0,hold=false)=>encodeInstruction({op,address,config,index,hold});
const image=(words,entry=0o100)=>({entry,words,diagnostics:[]});
function compare(g,c){
 const state=g.state();for(const n of 'ABCDE')assert.equal(state[n],c.getRegister(n),n);
 for(const n of ['P','Q','K','N','flags'])assert.equal(state[n],BigInt(c[n]),n);
 for(const n of ['limbo','dismissed','previousHold'])assert.equal(state[n],BigInt(c[n]),n);
 for(let i=0;i<64;i++)assert.equal(g.simulator.read('X'+i),c.X[i],'X'+i);
}
const testProgram=()=>assemble('.org 100\nLDA 200\nSTOP: JMP STOP\n.org 200\n.word 123');
function boot(code=testProgram(),options={}){return new TX2GateBoard(code,{inout:true,bootTape:encodeBinaryTape(code),historyLimit:0,...options});}
function runTo(g,address,maxInstructions=3000){
 for(let i=0;i<maxInstructions;i++){
  const x=g.stepInstruction();assert.equal(x.halt,0n,`hardware fault ${x.faultCode.toString(8)} at ${x.P.toString(8)}`);
  if(x.P===BigInt(address)&&x.phase===0n)return i+1;
 }throw new Error('Instruction budget exhausted');
}
test('software sequence flags, HOLD, priority, returns and reports match reference',()=>{
 const code=image([
  [0o100,I('SKX',0o200,0o10,0o60)],[0o101,I('SKX',0o300,0o10,0o50)],
  [0o102,I('JMP',0o102,0o20)],[0o300,I('SKX',0o400,0o10,0o40,true)],
  [0o301,I('LDA',0o500)],[0o400,I('JMP',0o401,0o20)],
  [0o302,I('SKX',0o302,0o30,0o50)],[0o303,I('JMP',0o304,0o20)],
  [0o200,I('LDB',0o501)],[0o201,I('JMP',0o201)], [0o500,1963n],[0o501,2026n]]);
 const g=new TX2GateBoard(code,{inout:true}),c=new TX2({profile:'tx2-io-research'});c.load(code);
 for(let i=0;i<10;i++){assert.equal(c.step().ok,true);g.stepInstruction();compare(g,c);}
});
test('IOS report observes flags/connection/mode before connect and disconnect',()=>{
 const code=image([[0o100,I('OPR',0o30002,1,0o52)],[0o101,I('OPR',0,1,0o52)],
  [0o102,I('OPR',0o20000,1,0o52)],[0o103,I('OPR',0,1,0o52)]]);
 const g=new TX2GateBoard(code,{inout:true}),c=new TX2({profile:'tx2-io-research'});c.load(code);
 for(let i=0;i<4;i++){assert.equal(c.step().ok,true);g.stepInstruction();compare(g,c);}
 assert.equal(g.simulator.read('io52.connected'),0n);
});
test('gate bootstrap starts with empty payload RAM and executes all F initialization words',()=>{
 const g=boot(),s=g.simulator;assert.equal(s.peek('STUV',0o100),0n);assert.equal(s.peek('STUV',0o200),0n);
 for(let i=0;i<32;i++)assert.equal(s.read('F'+i),0n);
 for(let i=0;i<8;i++)g.stepInstruction();assert.equal(g.state().P,0o377760n);
 for(let i=0;i<32;i++)assert.equal(s.read('F'+i),BigInt(STANDARD_CONFIGURATION[i]));
});
test('published reader leader is physically transferred by gate-buffer splay',()=>{
 const g=boot();runTo(g,3);
 for(let i=0;i<20;i++)assert.equal(g.simulator.peek('STUV',i+3),READER_LEADER_WORDS[i]);
 assert.equal(g.state().tapePosition,120n);assert.equal(g.state().K,0o52n);
});
test('gate-driven tape bootstrap loads discontiguous user blocks and calls their entry',()=>{
 const g=boot();const count=runTo(g,0o100);
 assert.equal(count,649);assert.equal(g.state().deviceClock,23900n);
 assert.equal(g.simulator.peek('STUV',0o200),0o123n);assert.equal(g.simulator.read('io52.connected'),0n);
 assert.equal(g.simulator.read('io52.missed'),0n);g.stepInstruction();assert.equal(g.state().A,0o123n);
});
test('corrupt payload checksum is rejected by executing loader, not by a host decoder',()=>{
 const code=testProgram(),frames=encodeBinaryTape(code);frames[frames.length-12]^=1;
 const g=new TX2GateBoard(code,{inout:true,bootTape:frames,deviceOptions:{readerPeriod:48},historyLimit:0});
 let restarted=false;for(let i=0;i<1500;i++){
  const state=g.stepInstruction();assert.equal(state.halt,0n);assert.notEqual(state.P,0o100n);
  if(i>30&&state.P===0o377760n){restarted=true;break;}
 }assert.ok(restarted);assert.notEqual(g.simulator.read('X46'),0n);assert.equal(g.state().A,0n);
});
test('all boot clock edges, tape transport and writes can be reversed exactly',()=>{
 const g=boot(testProgram(),{deviceOptions:{readerPeriod:48},historyLimit:10000,historyBytes:128*1024*1024});
 const before=g.simulator.snapshot();runTo(g,0o100);const clocks=g.simulator.ticks;
 assert.equal(clocks,9020);assert.equal(g.simulator.history.length,clocks);
 for(let i=0;i<clocks;i++)assert.ok(g.simulator.back());assert.deepEqual(g.simulator.snapshot(),before);
});
test('mid-boot snapshot resumes in an independent gate board with identical storage',()=>{
 const g=boot(testProgram(),{deviceOptions:{readerPeriod:48}});for(let i=0;i<80;i++)g.stepInstruction();
 const saved=g.simulator.snapshot(),other=boot(testProgram(),{deviceOptions:{readerPeriod:48}});other.simulator.restore(saved);
 runTo(g,0o100);runTo(other,0o100);assert.deepEqual(g.simulator.snapshot(),other.simulator.snapshot());
});
test('scope handshakes emit correct raw spots and dwell countdowns without host I/O',()=>{
 const code=assemble('.org 100\nREX_60 200\nIOS_60 30030\nJPD 102\n.org 200\nTSD 300\nTSD 301\nTSD 302\nTSD 303\nSTOP: JMP STOP\n.org 300\n.word 0\n.word 144000000000\n.word 144000144000\n.word 144000');
 assert.deepEqual(code.diagnostics,[]);const g=new TX2GateBoard(code,{inout:true});runTo(g,0o204);
 assert.equal(g.state().scopeCount,4n);assert.equal(g.state().K,0o60n);
 const clocks=[];for(let i=0;i<4;i++){
  const record=g.simulator.peek('scope_TRACE',i);assert.equal(record&((1n<<36n)-1n),code.words.find(([a])=>a===0o300+i)[1]);clocks.push(Number(record>>48n));
 }
 for(let i=1;i<4;i++)assert.ok(clocks[i]-clocks[i-1]>=32);
 assert.equal(g.simulator.read('scopeX'),0n);assert.equal(g.simulator.read('scopeY'),200n);
});
test('paper punch frames equal authentic assembly-mode unsplay and reverse with storage',()=>{
 const source='.org 100\nREX_63 200\nIOS_63 30002\nJPD 102\n.org 200\n'+Array(6).fill('hTSD 300').join('\n')+'\nSTOP: JMP STOP\n.org 300\n.word 123456765432';
 const code=assemble(source),g=new TX2GateBoard(code,{inout:true});runTo(g,0o206);
 const want=unsplayWord(0o123456765432n);assert.equal(g.state().punchCount,6n);
 assert.deepEqual(Array.from({length:6},(_,i)=>Number(g.simulator.peek('punch_TRACE',i)&127n)),Array.from(want));
 const saved=g.simulator.snapshot();g.simulator.clock();g.simulator.back();assert.deepEqual(g.simulator.snapshot(),saved);
});
test('gate light-pen comparator raises only for an illuminated spot inside its aperture',()=>{
 const code=assemble('.org 100\nREX_60 200\nREX_55 400\nIOS_55 30000\nIOS_60 30000\nJPD 104\n.org 200\nTSD 300\nSTOP: JMP STOP\n.org 300\n.word 0\n.org 400\nJMP 400');
 for(const [x,y,r,hit] of [[0,0,0,1],[3,4,5,1],[3,4,4,0],[511,511,8,0]]){
  const g=new TX2GateBoard(code,{inout:true,historyLimit:0}),s=g.simulator;
  s.input('penDown',1n);s.input('penX',BigInt(x));s.input('penY',BigInt(y));s.input('penRadius',BigInt(r));
  for(let i=0;i<6;i++)g.stepInstruction();assert.equal(g.state().penHits,BigInt(hit));assert.equal(g.state().K,hit?0o55n:0o60n);
 }
});
test('TRAP auto-marking and explicit SKM reset use the old metabit, and are reversible',()=>{
 const code=image([[0o100,I('OPR',0o30700,0,0o42)],[0o101,I('LDA',0o200)],[0o102,I('SKM',0o200,2,0o12)],[0o200,17n]]);
 const g=new TX2GateBoard(code,{inout:true});g.stepInstruction();g.stepInstruction();
 assert.equal(g.simulator.peek('META',0o101),1n);assert.equal(g.simulator.peek('META',0o200),1n);
 const saved=g.simulator.snapshot();g.stepInstruction();assert.equal(g.simulator.peek('META',0o200),0n);
 for(let i=0;i<4;i++)g.simulator.back();assert.deepEqual(g.simulator.snapshot(),saved);
});
test('marked operand trap flag and sequence handoff agree with instruction model',()=>{
 const code=image([[0o100,I('SKX',0o300,0,0o42)],[0o101,I('OPR',0o30004,0,0o42)],
  [0o102,I('LDA',0o200)],[0o103,I('JMP',0o104,0o20)],[0o300,I('JMP',0o300)],[0o200,17n]]);
 const g=new TX2GateBoard(code,{inout:true}),c=new TX2({profile:'tx2-io-research'});c.load(code);
 g.simulator.poke('META',0o200,1n);c.memory.setMeta(0o200,true);
 for(let i=0;i<5;i++){assert.equal(c.step().ok,true);g.stepInstruction();compare(g,c);}assert.equal(g.state().K,0o42n);
});
test('unsupported command, invalid flag number and configured TSD do not commit',()=>{
 const words=[I('OPR',0o30001,0,0o60),I('OPR',0o30000,0,0o54),I('SKX',0,0o10,1)];
 for(const word of words){const g=new TX2GateBoard(image([[0o100,word]]),{inout:true});g.stepInstruction();assert.equal(g.state().halt,1n);assert.equal(g.state().retired,0n);}
});
test('gate execution never calls the instruction emulator or its peripheral transfer hooks',()=>{
 const oldStep=TX2.prototype.step,oldExecute=TX2.prototype.execute;
 TX2.prototype.step=TX2.prototype.execute=()=>{throw new Error('Forbidden instruction fallback');};
 try{const g=new TX2GateBoard(assemble('.org 100\nIOS_60 30000'),{inout:true});g.stepInstruction();assert.equal(g.simulator.read('io60.connected'),1n);}
 finally{TX2.prototype.step=oldStep;TX2.prototype.execute=oldExecute;}
});

test('gate console ports are read-only and external button META is not overwritten',()=>{
 const code=assemble('.org 100\nLDA 377720\nSTA 377721\nLDB 377621\nSKM^02_12 377621');
 const g=new TX2GateBoard(code,{inout:true}),s=g.simulator;
 s.input('toggle20',1963n);s.input('toggle21',2026n);s.input('pushButtons',0o123n);s.input('buttonMeta',1n);
 for(let i=0;i<4;i++)g.stepInstruction();assert.equal(g.state().A,1963n);assert.equal(g.state().B,0o123n);
 assert.equal(s.read('toggle21'),2026n);assert.equal(s.read('buttonMeta'),1n);
});
test('configured peripheral TSD faults before emitting a scope spot',()=>{
 const code=assemble('.org 100\nREX_60 200\nIOS_60 30000\nJPD 102\n.org 200\nTSD^1 300\n.org 300\n.word 0');
 const g=new TX2GateBoard(code,{inout:true});for(let i=0;i<4;i++)g.stepInstruction();
 assert.equal(g.state().halt,1n);assert.equal(g.state().scopeCount,0n);assert.equal(g.state().retired,3n);
});
test('free-running tape transport records overrun instead of queuing unlimited frames',()=>{
 const g=boot(testProgram(),{deviceOptions:{readerPeriod:1}});
 for(let i=0;i<95;i++)g.simulator.clock();assert.ok(g.state().tapePosition>1n);assert.equal(g.simulator.read('io52.missed'),1n);
});
