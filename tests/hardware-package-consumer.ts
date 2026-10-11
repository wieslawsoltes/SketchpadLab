import {NetlistBuilder,DigitalSimulator,TX2GateBoard,ElectricalSimulator,HardwareSession,Logic,type ElectricalCircuit,type Netlist,type SessionSummary} from '@sketchpad-lab/hardware-sim';
import {assemble} from '@sketchpad-lab/hardware-sim/assembler';
const b=new NetlistBuilder(),input=b.input('input',1),q=b.register('q',1);q.connect(input);b.output('q',q.q);
const plan:Netlist=b.compile();const d=new DigitalSimulator(plan);d.input('input',1n);d.clock();const value:bigint=d.read('q');
const board=new TX2GateBoard(assemble('.org 100\nLDA 200\n.org 200\n.word 123'));const state:bigint=board.stepInstruction().A;
const circuit:ElectricalCircuit={nodes:['0','a'],components:[{name:'R',type:'R',p:'a',n:'0',value:1000}]};
new ElectricalSimulator(circuit).operatingPoint();const session=new HardwareSession();const summary:SessionSummary=session.summary();
if(summary.powered){const clock:number|null=summary.ticks;void clock;}
const unknown:2=Logic.X;void [value,state,unknown];
// @ts-expect-error Logic state and voltage component schema must not silently accept invalid values.
const bad:ElectricalCircuit={nodes:['0','a'],components:[{name:'R',type:'R',p:'a',n:'0',source:1}]};void bad;
import {observeBoard,priorityCircuit,sequenceRegisters,type DeviceOptions,type PenInput} from '@sketchpad-lab/hardware-sim';
const options:DeviceOptions={readerPeriod:48,traceDepth:32};
const io=new TX2GateBoard(assemble('.org 100\nIOS_60 30000'),{inout:true,deviceOptions:options});
const k:bigint|undefined=io.state().K;const observation=observeBoard(io);void [k,observation,priorityCircuit,sequenceRegisters];
const pen:PenInput={x:0,y:0,down:true,radius:8};session.pen(pen);
// @ts-expect-error Device periods are numeric, not source code or expressions.
const invalidPeriod:DeviceOptions={readerPeriod:'fast'};void invalidPeriod;

import {GPUResidentSimulator,type ResidentResult,type ResidentStats} from '@sketchpad-lab/hardware-sim';
async function residentConsumer(sim:DigitalSimulator):Promise<ResidentResult>{
 const gpu=await GPUResidentSimulator.create(sim,{probes:['q'],maxBatch:8});
 try{const stats:ResidentStats=gpu.stats();void stats;return await gpu.run(8);}finally{gpu.dispose();}
}
void residentConsumer;

import {AdaptiveElectricalSimulator,type AdaptiveCircuit,type AdaptiveIntegrationResult} from '@sketchpad-lab/hardware-sim';
const adaptiveCircuit:AdaptiveCircuit={...circuit,integration:{mode:'adaptive',relativeTolerance:1e-4}};
const adaptiveResult:AdaptiveIntegrationResult=new AdaptiveElectricalSimulator(adaptiveCircuit).stepAdaptive(.001);
const substeps:number=adaptiveResult.integration.acceptedSteps;void substeps;
