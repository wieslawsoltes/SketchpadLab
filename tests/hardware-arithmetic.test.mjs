import {test} from 'node:test';import assert from 'node:assert/strict';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
import {DigitalSimulator} from '../packages/hardware-sim/digital.js';
import {barrelCircuit,multiplyCircuit,divideCircuit,EXTENDED_OPERATIONS} from '../packages/hardware-sim/arithmetic-circuits.js';
import {TX2GateBoard,BOARD_OPERATIONS} from '../packages/hardware-sim/tx2-board.js';
import {TX2} from '../packages/tx2-core/cpu.js';
import {encodeInstruction} from '../packages/tx2-core/instruction.js';
import {assemble} from '../packages/tx2-assembler/index.js';
let seed=54276941n;const rand=()=>{seed=(seed*6364136223846793005n+1n)&((1n<<64n)-1n);return seed&((1n<<36n)-1n);};
test('barrel circuits reproduce left/right rotation and sign-preserving scaling',()=>{
 for(const width of [9,18,36,72]){
  const b=new NetlistBuilder(),value=b.input('value',width),count=b.input('count',8),right=b.input('right');
  b.output('cycle',barrelCircuit(b,value,count,right[0],{cycle:true}));b.output('scale',barrelCircuit(b,value,count,right[0]));
  const s=new DigitalSimulator(b.compile()),mask=(1n<<BigInt(width))-1n,sign=1n<<BigInt(width-1);
  for(let i=0;i<32;i++)for(let direction=0;direction<2;direction++){
   const n=(i*31)%256,v=((rand()<<36n)|rand())&mask;s.input('value',v);s.input('count',BigInt(n));s.input('right',BigInt(direction));
   let cycle=v,scaled=v;for(let j=0;j<n;j++){
    cycle=direction?((cycle>>1n)|((cycle&1n)<<BigInt(width-1))):((cycle<<1n)|(cycle>>BigInt(width-1)))&mask;
    scaled=direction?(scaled&sign)|scaled>>1n:(scaled&sign)|(((scaled<<1n)|((scaled&sign)?1n:0n))&(sign-1n));
   }assert.equal(s.read('cycle'),cycle);assert.equal(s.read('scale'),scaled);
  }
 }
});
test('carry-save multiplication agrees with exact unsigned arithmetic',()=>{
 const b=new NetlistBuilder(),a=b.input('a',35),c=b.input('b',35);b.output('product',multiplyCircuit(b,a,c));const s=new DigitalSimulator(b.compile());
 for(let i=0;i<100;i++){const x=rand()&0x7ffffffffn,y=rand()&0x7ffffffffn;s.input('a',x);s.input('b',y);assert.equal(s.read('product'),x*y);}
});
test('restoring divider computes quotient, remainder and divide-by-zero signal',()=>{
 const b=new NetlistBuilder(),a=b.input('a',17),c=b.input('b',9),r=divideCircuit(b,a,c);b.output('quotient',r.quotient);b.output('remainder',r.remainder);b.output('zero',[r.zero]);
 const s=new DigitalSimulator(b.compile());for(let i=0;i<100;i++){const x=rand()&131071n,y=(rand()&511n)||1n;s.input('a',x);s.input('b',y);assert.equal(s.read('quotient'),x/y);assert.equal(s.read('remainder'),x%y);assert.equal(s.read('zero'),0n);}
 s.input('b',0n);assert.equal(s.read('zero'),1n);
});
function compare(board,cpu){const s=board.state();for(const n of 'ABCDE')assert.equal(s[n],cpu.getRegister(n),n);assert.equal(s.Z,BigInt(cpu.overflowFlags),'Z');assert.equal(s.P,BigInt(cpu.P),'P');assert.equal(s.Q,BigInt(cpu.Q),'Q');assert.equal(s.N,cpu.N,'N');}
test('extended board independently executes all 48 research instruction handlers',()=>{
 const board=new TX2GateBoard({entry:0o100,words:[[0o100,0n]]},{extended:true,depth:512}),s=board.simulator,cpu=new TX2();assert.equal(BOARD_OPERATIONS.length,48);
 for(const op of BOARD_OPERATIONS){const word=encodeInstruction({op,address:0o200}),image={entry:0o100,words:[[0o100,word],[0o200,1963n]]};
  s.reset({clearMemory:true});s.poke('STUV',0o100,word);s.poke('STUV',0o200,1963n);cpu.load(image);
  assert.equal(cpu.step().ok,true,op);board.stepInstruction();assert.equal(board.state().halt,0n,op);
  try{compare(board,cpu);}catch(e){e.message=op+': '+e.message;throw e;}
 }
});
test('extended gate arithmetic agrees on all standard configurations and overflow states',()=>{
 const board=new TX2GateBoard({entry:0o100,words:[[0o100,0n]]},{extended:true,depth:512}),s=board.simulator,cpu=new TX2();let accepted=0,rejected=0;
 const put=(name,value)=>s.plan.outputs[name].forEach((p,i)=>s.values[p]=Number(value>>BigInt(i)&1n));
 for(const op of EXTENDED_OPERATIONS)for(let cf=0;cf<32;cf++){
  const word=encodeInstruction({op,config:cf,address:0o200}),operand=rand();s.reset({clearMemory:true});s.poke('STUV',0o100,word);s.poke('STUV',0o200,operand);
  cpu.load({entry:0o100,words:[[0o100,word],[0o200,operand]]});
  for(const name of 'ABCDE'){const v=op==='DIV'&&name==='A'?(cf%2?0xfffffffffn:0n):rand();cpu.setRegister(name,v);put(name,v);}
  cpu.overflowFlags=cf&15;cpu.overflow=!!cpu.overflowFlags;put('Z',BigInt(cpu.overflowFlags));s.settle();
  const result=cpu.step();board.stepInstruction();
  try{if(result.ok){assert.equal(board.state().halt,0n);compare(board,cpu);accepted++;}
      else{assert.equal(result.error.code,'UNIMPLEMENTED');assert.equal(board.state().halt,1n);assert.equal(board.state().retired,0n);rejected++;}}
  catch(e){e.message=`${op} cf=${cf.toString(8)}: ${e.message}`;throw e;}
 }
 assert.ok(accepted>250);assert.ok(rejected>0);
});
test('assembled multiply/divide program reverses the gate storage, no instruction fallback',()=>{
 const image=assemble('.org 100\nLDA 200\nMUL 201\nDIV 201\nSTA 202\n.org 200\n.word 0d1963\n.word 0d23');
 const board=new TX2GateBoard(image,{extended:true,depth:512});for(let i=0;i<4;i++)board.stepInstruction();assert.equal(board.state().A,1963n);assert.equal(board.simulator.peek('STUV',0o202),1963n);
 const saved=board.simulator.snapshot();board.simulator.clock();board.simulator.back();assert.deepEqual(board.simulator.snapshot(),saved);
});
