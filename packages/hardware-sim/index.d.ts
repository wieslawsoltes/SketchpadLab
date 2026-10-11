import type {DeviceOptions, IOBoardState, BoardObservation, PenInput} from './io-types.js';
export * from './io-types.js';
/** Structural gates are logical models, not historically measured TX-2 electronics. */
export type Integer = bigint | number | string;
export type LogicState = 0 | 1 | 2 | 3;
export type Bus = number[];
export const Logic: Readonly<{LOW:0;HIGH:1;X:2;Z:3}>;
export const Gate: Readonly<{BUF:0;NOT:1;AND:2;OR:3;XOR:4;NAND:5;NOR:6;XNOR:7;MUX:8;TRI:9;RESOLVE:10}>;
export const GATE_NAMES: readonly string[];
export const ARITY: readonly number[];
export const TRUTH_TABLE: Uint32Array;
export function logicValue(value:number):LogicState;
export function logicGate(op:number,a:number,b?:number,c?:number):LogicState;
export class UnknownSignalError extends Error {constructor(name:string)}
export function readBus(values:ArrayLike<number>,bus:Bus,name?:string):bigint;
export function writeBus(values:Uint32Array,bus:Bus,value:Integer):void;
export interface GateEntry {op:number;a:number;b:number;c:number;q:number;delay:number}
export interface FlipFlop {q:number;d:number;enable:number;reset:number;initial:LogicState}
export interface MemoryPort {name:string;width:number;depth:number;address:Bus;data:Bus;write:number;read:Bus;readonly:[number,number][]}
export interface Netlist {
 version:1;name:string;names:string[];initial:number[];gates:GateEntry[];flops:FlipFlop[];
 inputs:Record<string,Bus>;outputs:Record<string,Bus>;memories:MemoryPort[];
}
export interface CompiledNetlist extends Netlist {levels:number[][];order:number[];fanout:number[][];cyclic:boolean;fingerprint:string}
export interface Register {q:Bus;connect(d:Bus,enable?:number,reset?:number):void}
export interface AdderResult {sum:Bus;carry:number;carries:Bus}
export class NetlistBuilder {
 constructor(name?:string);name:string;names:string[];initial:number[];gates:GateEntry[];flops:FlipFlop[];
 inputs:Record<string,Bus>;outputs:Record<string,Bus>;memories:MemoryPort[];zero:number;one:number;
 wire(name?:string,initial?:LogicState):number;claim(wire:number,driver:string|number):void;
 input(name:string,width?:number,initial?:Integer):Bus;output(name:string,bus:Bus):Bus;
 unique(name:string,object:object):void;constant(value:Integer,width:number):Bus;
 drive(q:number,op:number,a:number,b?:number,c?:number,delay?:number):number;
 gate(op:number,a:number,b?:number,c?:number,name?:string,delay?:number):number;
 not(a:number):number;and(a:number,b:number):number;or(a:number,b:number):number;xor(a:number,b:number):number;
 mux(a:number,b:number,select:number):number;all(bits:Bus):number;any(bits:Bus):number;
 reduce(bits:Bus,op:number,identity:number):number;bits(op:number,a:Bus,b?:Bus):Bus;
 select(a:Bus,b:Bus,control:number):Bus;eq(a:Bus,b:Bus):number;eqConstant(a:Bus,n:Integer):number;
 register(name:string,width:number,initial?:Integer):Register;add(a:Bus,b:Bus,carry?:number):AdderResult;
 onesAdd(a:Bus,b:Bus):AdderResult & {overflow:number};
 ram(name:string,options:Omit<MemoryPort,'name'|'read'|'readonly'> & {readonly?:[number,number][]}):Bus;
 compile(options?:{allowCycles?:boolean}):CompiledNetlist;
}
export interface DigitalOptions {historyLimit?:number;historyBytes?:number}
export interface DigitalSnapshot {schema:'hardware-digital-1';fingerprint:string;ticks:number;values:Uint32Array|number[];memories:(Uint32Array|number[])[]}
export interface DigitalStats {backend:string;wires:number;gates:number;flipFlops:number;levels:number;memoryBits:number;ticks:number;gateEvaluations:number;reversibleTicks:number}
export function importNetlist(source:Netlist):CompiledNetlist;
export function flopValue(values:ArrayLike<number>,f:FlipFlop):LogicState;
export class DigitalSimulator {
 constructor(plan:Netlist,options?:DigitalOptions);plan:CompiledNetlist;values:Uint32Array;ticks:number;backend:string;
 memories:(MemoryPort & {values:Uint32Array})[];history:unknown[];historyLimit:number;evaluations:number;
 settle():void;reset(options?:{clearMemory?:boolean}):void;input(name:string,value:Integer):void;read(name:string):bigint;
 memory(name:string):MemoryPort & {values:Uint32Array};poke(name:string,address:number,value:Integer):void;peek(name:string,address:number):bigint;
 clock():number;back():boolean;run(budget?:number,stop?:string):{executed:number;ticks:number;halted:boolean};
 snapshot():DigitalSnapshot;restore(state:DigitalSnapshot):void;stats():DigitalStats;
}
export interface WaveSample {tick:number;bits:string[]}
export class Waveform {
 constructor(plan:Netlist,names:string[],options?:{limit?:number;tickNs?:number});signals:{name:string;bus:Bus}[];samples:WaveSample[];limit:number;tickNs:number;dropped:number;
 capture(simulator:{ticks:number;values:ArrayLike<number>}):WaveSample;vcd():string;
}
export interface TimedOptions {delayModel?:'inertial'|'transport';clockToQ?:number;maxEvents?:number;traceLimit?:number}
export interface TimedSnapshot {
 schema:'hardware-timed-1';fingerprint:string;delayModel:'inertial'|'transport';clockToQ:number;
 time:number;serial:number;processed:number;values:Uint32Array|number[];tokens:Float64Array|number[];desired:Uint32Array|number[];
 events:unknown[];trace:{time:number;changes:[number,number][]}[];traceBase:Uint32Array|number[];traceBaseTime:number;
}
export class TimedSimulator {
 constructor(plan:Netlist,options?:TimedOptions);plan:CompiledNetlist;values:Uint32Array;time:number;processed:number;history:unknown[];
 trace:{time:number;changes:[number,number][]}[];traceBase:Uint32Array;traceBaseTime:number;
 input(name:string,value:Integer|LogicState[],at?:number):void;clock(at?:number):void;
 runUntil(until:number,budget?:number):{time:number;events:number;pending:number};read(name:string):bigint;
 snapshot():TimedSnapshot;restore(snapshot:TimedSnapshot):void;back():boolean;
}
export type IndependentSource = number | {pwl:[number,number][]};
interface TwoTerminal {name:string;p:string;n:string}
export type ElectricalComponent =
 | (TwoTerminal & {type:'R'|'C'|'L';value:number})
 | (TwoTerminal & {type:'I'|'V';source:IndependentSource})
 | (TwoTerminal & {type:'D';Is?:number;vt?:number})
 | {name:string;type:'Q';c:string;b:string;e:string;polarity?:'npn'|'pnp';Is?:number;vt?:number;betaF?:number;betaR?:number};
export interface ElectricalCircuit {nodes:string[];components:ElectricalComponent[]}
export interface ElectricalOptions {maxIterations?:number;relativeTolerance?:number;voltageTolerance?:number;currentTolerance?:number;historyLimit?:number}
export interface ElectricalResult {time:number;iterations:number;normalizedResidual:number;voltages:Record<string,number>}
export interface ElectricalSnapshot {schema:'hardware-electrical-1';fingerprint:string;time:number;state:Float64Array|number[];overrides:Record<string,number>;iterations:number;residual:number}
export class ElectricalSimulator {
 constructor(circuit:ElectricalCircuit,options?:ElectricalOptions);circuit:ElectricalCircuit;nodes:string[];components:ElectricalComponent[];
 size:number;state:Float64Array;time:number;iterations:number;residual:number;history:unknown[];
 voltage(node:string):number;branchCurrent(name:string):number;setSource(name:string,value:number):void;
 operatingPoint():ElectricalResult;step(dt:number):ElectricalResult;run(duration:number,dt:number,maxSteps?:number):ElectricalResult[];
 snapshot():ElectricalSnapshot;restore(state:ElectricalSnapshot):void;back():boolean;
}
export interface DAC {port:string;source:string;low:number;high:number}
export interface ADC {port:string;node:string;low:number;high:number;hysteresis?:boolean}
export interface MixedCircuit {netlist:Netlist;circuit:ElectricalCircuit;dac?:DAC[];adc?:ADC[]}
export interface MixedSnapshot {schema:'hardware-mixed-1';mapping:string;digital:DigitalSnapshot;electrical:ElectricalSnapshot}
export class MixedSignalSimulator {
 constructor(model:MixedCircuit,options?:DigitalOptions);digital:DigitalSimulator;electrical:ElectricalSimulator;readonly time:number;history:unknown[];historyLimit:number;
 step(dt:number):ElectricalResult & {ticks:number};snapshot():MixedSnapshot;restore(state:MixedSnapshot):void;back():boolean;
}
export const FRACTURES:readonly number[][][];
export function muxWords(b:NetlistBuilder,words:Bus[],selector:Bus):Bus;
export function exchangeCircuit(b:NetlistBuilder,cfg:Bus,memory:Bus,existing:Bus,options?:{store?:boolean;signExtend?:boolean}):Bus;
export function arithmeticCircuit(b:NetlistBuilder,cfg:Bus,a:Bus,operand:Bus,oldC:Bus,oldD:Bus,loadedD:Bus,oldFlags:Bus,subtract:number):{A:Bus;C:Bus;D:Bus;Z:Bus};
export function activeMaskCircuit(b:NetlistBuilder,cfg:Bus,options?:{quartersOnly?:boolean}):Bus;
export function gateRam(b:NetlistBuilder,options:{name:string;width:number;depth:number;address:Bus;data:Bus;write:number;initial?:Map<number,bigint>}):Bus;
export function indexedAddressCircuit(b:NetlistBuilder,address:Bus,index:Bus):Bus;
export function barrelCircuit(b:NetlistBuilder,value:Bus,count:Bus,right:number,options?:{cycle?:boolean}):Bus;
export function multiplyCircuit(b:NetlistBuilder,a:Bus,c:Bus):Bus;
export function divideCircuit(b:NetlistBuilder,numerator:Bus,denominator:Bus):{quotient:Bus;remainder:Bus;zero:number};
export function extendedArithmeticCircuit(b:NetlistBuilder,cfg:Bus,old:Record<'A'|'B'|'C'|'D',Bus>,operand:Bus,loadedD:Bus,flags:Bus,is:Record<string,number>):Record<'A'|'B'|'C'|'D'|'Z',Bus> & {fault:number;enabled:number};
export const COMPACT_OPERATIONS:readonly string[];
export const EXTENDED_OPERATIONS:readonly string[];
export const BOARD_OPERATIONS:readonly string[];
export interface BoardOptions extends DigitalOptions {memory?:'macro'|'gates';depth?:number;extended?:boolean;inout?:boolean;bootTape?:Uint8Array|null;deviceOptions?:DeviceOptions}
export interface BoardImage {entry?:number;words:[number,bigint][];diagnostics?:{severity?:string}[]}
export interface BuiltBoard {plan:CompiledNetlist;memory:'macro'|'gates';depth:number;initial:Map<number,bigint>;inout:boolean;initialMemories:Map<string,Map<number,bigint>>;traceDepth:number}
export type BoardState = Record<'P'|'Q'|'N'|'EA'|'phase'|'halt'|'retired'|'A'|'B'|'C'|'D'|'E'|'Z'|'faultCode',bigint> & Partial<IOBoardState>;
export function buildTX2Board(image:BoardImage,options?:BoardOptions):BuiltBoard;
export class TX2GateBoard {constructor(image:BoardImage,options?:BoardOptions);board:BuiltBoard;simulator:DigitalSimulator;state():BoardState;stepInstruction(maxClocks?:number):BoardState & {clocks:number}}
/** The caller may supply navigator.gpu; DOM WebGPU declarations are not required by CPU consumers. */
export interface GPUProvider {requestAdapter():Promise<{requestDevice():Promise<object>}|null>}
export interface GPUOptions {gpu?:GPUProvider|null}
export const GATE_SHADER:string;
export class WebGPUGateEvaluator {
 static create(plan:Netlist,options?:GPUOptions):Promise<WebGPUGateEvaluator>;
 constructor(plan:Netlist,device:object);plan:CompiledNetlist;busy:boolean;evaluations:number;dispatches:number;failure:Error|null;
 initialize():Promise<void>;evaluate(values:Uint32Array):Promise<Uint32Array>;dispose():void;
}
export class GPUClockedSimulator {
 static create(simulator:DigitalSimulator,options?:GPUOptions):Promise<GPUClockedSimulator>;
 constructor(simulator:DigitalSimulator,evaluator:WebGPUGateEvaluator);
 simulator:DigitalSimulator;evaluator:WebGPUGateEvaluator;busy:boolean;settle():Promise<void>;clock():Promise<number>;dispose():void;
}
export type ModelKind = 'board'|'netlist'|'timed'|'electrical'|'mixed';
export interface SessionConfiguration {kind?:ModelKind;source?:string;backend?:'cpu'|'webgpu';memory?:'macro'|'gates';extended?:boolean;dialect?:'explicit'|'m4';delayModel?:'inertial'|'transport';inout?:boolean;boot?:'image'|'tape';deviceOptions?:Omit<DeviceOptions,'tapeFrames'>}
export interface AdvanceOptions {operation?:'run'|'clock'|'instruction'|'operatingPoint';budget?:number;step?:number;until?:number|null;breakpoint?:number|null}
export interface SignalCone {port:string;bit:number;nodes:{pin:number;depth:number;name:string;driver:string;value:string;inputs:number[]}[]}
export interface PoweredSummary {
 inout:BoardObservation|null;powered:true;kind:ModelKind;backend:string;busy:boolean;ticks:number|null;time:number|null;units:string;
 ports:{name:string;width:number;bits:string;value:string}[];statistics:Partial<DigitalStats> & {events?:number};
 electrical:{iterations:number;residual:number;solved:boolean;nodes:number;components:number}|null;
 series:{time:number;values:Record<string,number|null>;currents:Record<string,number>}[];
 signals?:{name:string;width:number}[];wave?:WaveSample[];checkpoint:boolean;reversible:number;
 lastRun:{executed:number;reason:string;wallMs:number}|null;gpu:{evaluations:number;dispatches:number}|null;
}
export type SessionSummary = {powered:false} | PoweredSummary;
export class HardwareSession {
 constructor();busy:boolean;configuration:SessionConfiguration|null;board?:TX2GateBoard|null;simulator:DigitalSimulator|TimedSimulator|ElectricalSimulator|MixedSignalSimulator|null;
 load(configuration?:SessionConfiguration):Promise<SessionSummary>;advance(options?:AdvanceOptions,onProgress?:(state:SessionSummary)=>void):Promise<SessionSummary>;
 digital():DigitalSimulator|TimedSimulator|null;electrical():ElectricalSimulator|null;
 pen(input:PenInput):void;applyPen():void;pause():void;back():SessionSummary;checkpoint():SessionSummary;restoreCheckpoint():SessionSummary;
 exportSnapshot():string;restoreSnapshot(text:string):Promise<SessionSummary>;exportTrace():string;exportNetlist():string;
 inspect(port:string,bit?:number):SignalCone;summary():SessionSummary;dispose():void;
}
export function hardwareJSON(value:unknown):string;
export interface HardwareExample extends SessionConfiguration {name:string;kind:ModelKind;source:string}
export function hardwareExamples():HardwareExample[];
