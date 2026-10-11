/** Reproducible CPU baseline. These are logical gates/clocks, not calibrated TX-2 timing. */
import {performance} from 'node:perf_hooks';
import {cpus,platform,arch} from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
import {assemble} from '../packages/tx2-assembler/index.js';
import {TX2GateBoard} from '../packages/hardware-sim/tx2-board.js';
const image=assemble('.org 100\nLOOP: LDA 200\nADD 201\nSTA 200\nJMP LOOP\n.org 200\n.word 0\n.word 1');
if(image.diagnostics.length)throw new Error(JSON.stringify(image.diagnostics));
const rows=[];
for(const options of [{extended:false,inout:false},{extended:true,inout:false},{extended:false,inout:true},{extended:true,inout:true}]){
 const start=performance.now(),board=new TX2GateBoard(image,options),setupMs=performance.now()-start,s=board.simulator;
 s.run(256);const samples=[];let evaluations=0;
 for(let n=0;n<3;n++){
  const before=s.evaluations,start=performance.now();s.run(4096);
  samples.push(performance.now()-start);evaluations+=s.evaluations-before;
 }
 const sorted=[...samples].sort((a,b)=>a-b);
 rows.push({options,setupMs,statistics:s.stats(),clocksPerSample:4096,samplesMs:samples,medianClocksPerSecond:4096000/sorted[1],gateEvaluationsPerClock:evaluations/(3*4096)});
}
const report={environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model??'unknown'},
 notes:'Single process, 256-clock warm-up, three samples, default reversible history. Setup excluded from throughput. Not a browser or physical-GPU benchmark; not historical TX-2 timing.',rows};
await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
await writeFile(new URL('../test-results/hardware-benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
