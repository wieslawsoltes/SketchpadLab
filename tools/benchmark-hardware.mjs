/** Repeatable gate-backend benchmark; no timing thresholds in correctness tests.
 * Optional --baseline points to a prior DigitalSimulator module. Both versions
 * execute the SAME compiled circuit and must produce identical state/counters. */
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assemble} from '../packages/tx2-assembler/index.js';
import {buildTX2Board} from '../packages/hardware-sim/tx2-board.js';
import {DigitalSimulator} from '../packages/hardware-sim/digital.js';
const args=process.argv.slice(2);
if(args.length&&!((args.length===2)&&args[0]==='--baseline'))throw new Error('Usage: node tools/benchmark-hardware.mjs [--baseline module.mjs]');
const engines=[];if(args.length)engines.push(['baseline',(await import(pathToFileURL(resolve(args[1])).href)).DigitalSimulator]);
engines.push(['current',DigitalSimulator]);
const image=assemble('.org 100\nLDA 200\nADD 201\nSTA 200\nJMP 100\n.org 200\n.word 0\n.word 1');
const plan=buildTX2Board(image,{extended:true,depth:256}).plan,results=[];
for(const [name,Simulator] of engines){
 const samples=[];
 for(let trial=0;trial<3;trial++){
  const s=new Simulator(plan,{historyLimit:0});for(const [address,value]of image.words)s.poke('STUV',address,value);
  s.run(500);let start=performance.now();s.run(3000);const clockMs=performance.now()-start;
  start=performance.now();for(let i=0;i<10000;i++)s.settle();const settledMs=performance.now()-start;
  samples.push({clockMs,settledMs,result:s.read('A').toString(),gateEvaluations:s.evaluations});
 }
 results.push({name,clocks:3000,idleSettles:10000,samples,
  medianClockMs:samples.map(s=>s.clockMs).sort((a,b)=>a-b)[1],medianIdleMs:samples.map(s=>s.settledMs).sort((a,b)=>a-b)[1]});
}
const samples=results.flatMap(r=>r.samples),first=samples[0];
if(samples.some(s=>s.result!==first.result||s.gateEvaluations!==first.gateEvaluations))throw new Error('Benchmark backends disagree on results or evaluation count');
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,
 model:'extended arithmetic loop, 256-word RAM macro, history disabled',gates:plan.gates.length,levels:plan.levels.length,results},null,2));
