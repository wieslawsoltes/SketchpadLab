import {test} from 'node:test';import assert from 'node:assert/strict';
import {HardwareSession} from '../packages/hardware-sim/session.js';
import {hardwareExamples} from '../packages/hardware-sim/examples.js';
import {observeBoard} from '../packages/hardware-sim/observe.js';
const examples=hardwareExamples();
test('session executes tape boot to a fetch breakpoint without host payload preloading',async()=>{
 const s=new HardwareSession();await s.load({...examples[9],deviceOptions:{readerPeriod:48}});
 assert.equal(s.simulator.peek('STUV',0o200),0n);assert.equal(s.summary().inout.tape.position,0);
 const r=await s.advance({budget:40000,breakpoint:0o100});assert.equal(r.lastRun.reason,'breakpoint');
 assert.equal(s.board.state().K,0o52n);assert.equal(s.simulator.peek('STUV',0o200),1963n);
 assert.equal(r.inout.tape.connected,false);assert.equal(r.inout.tape.missed,false);
 await s.advance({operation:'instruction'});assert.equal(s.board.state().A,1963n);assert.equal(s.board.state().phase,0n);
});
test('scope observation decodes emitted storage and light pen input is coalesced safely',async()=>{
 const s=new HardwareSession();await s.load({...examples[8],deviceOptions:{traceDepth:128}});
 s.pen({x:340,y:0,down:true,radius:32});await s.advance({budget:6000});
 const before=s.simulator.snapshot(),view=observeBoard(s.board);
 assert.deepEqual(s.simulator.snapshot(),before);assert.ok(view.scope.count>=96);assert.equal(view.scope.points.length,128);
 for(const point of view.scope.points)assert.ok(Math.abs(Math.hypot(point.x,point.y)-340)<1);
 assert.ok(view.pen.hits>0);assert.equal(view.pen.down,true);assert.equal(s.simulator.read('halt'),0n);
 const beforeInput=s.simulator.snapshot();s.busy=true;s.pen({x:-3,y:-4,down:false,radius:5});
 assert.deepEqual(s.simulator.snapshot(),beforeInput);s.busy=false;s.applyPen();assert.equal(s.summary().inout.pen.x,-3);
 assert.equal(s.simulator.history.length,0);assert.throws(()=>s.pen({x:512,y:0,down:true}));
});
test('portable INOUT session snapshots restore media, output rings, periods and inputs',async()=>{
 const s=new HardwareSession();await s.load({...examples[10],deviceOptions:{punchPeriod:8,traceDepth:8}});
 await s.advance({budget:150});s.checkpoint();const text=s.exportSnapshot(),copy=new HardwareSession();
 await copy.restoreSnapshot(text);assert.equal(copy.exportSnapshot(),text);assert.deepEqual(copy.summary().inout,s.summary().inout);
 const count=s.summary().inout.punch.count;assert.equal(count,6);assert.equal(s.summary().inout.punch.frames.length,6);
 await s.advance({operation:'clock'});s.restoreCheckpoint();assert.equal(s.exportSnapshot(),text);
});
test('invalid INOUT session configuration leaves the active model untouched',async()=>{
 const s=new HardwareSession();await s.load({...examples[0],extended:false});const before=s.exportSnapshot();
 for(const options of [{boot:'tape'},{inout:true,boot:'tape',memory:'gates'},{deviceOptions:{readerPeriod:0}},
 {deviceOptions:{tapeFrames:[1]}},{deviceOptions:{traceDepth:3},inout:true}]){
  await assert.rejects(s.load({...examples[0],extended:false,...options}));assert.equal(s.exportSnapshot(),before);
 }
 assert.throws(()=>s.pen({x:0,y:0,down:true}),/INOUT/);
});
test('marked P fetch breakpoint compares physical address rather than the placekeeper mark',async()=>{
 const s=new HardwareSession();await s.load({...examples[0],extended:false});
 s.simulator.plan.outputs.P.forEach((pin,i)=>s.simulator.values[pin]=Number(0o400100n>>BigInt(i)&1n));s.simulator.settle();
 const result=await s.advance({budget:20,breakpoint:0o100});assert.equal(result.lastRun.reason,'breakpoint');assert.equal(result.ticks,0);
});
