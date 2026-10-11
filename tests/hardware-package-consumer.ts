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
