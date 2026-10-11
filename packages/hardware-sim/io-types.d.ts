import type {NetlistBuilder,Bus,TX2GateBoard} from './index.js';
/** All device periods are logical clock counts, not calibrated nanoseconds. */
export interface DeviceOptions {
 tapeFrames?:Uint8Array;readerPeriod?:number;rewindPeriod?:number;scopePeriod?:number;punchPeriod?:number;traceDepth?:number;
}
export type IOBoardState = Record<'K'|'flags'|'limbo'|'previousHold'|'dismissed'|'TSP'|'deviceClock'|'tapePosition'|'scopeCount'|'punchCount'|'penHits',bigint>;
export interface PenInput {x:number;y:number;down:boolean;radius?:number}
export interface BoardObservation {
 clock:number;sequence:number;limbo:boolean;
 tape:{position:number;frames:number;eof:boolean;rewinding:boolean;connected:boolean;ready:boolean;missed:boolean};
 scope:{count:number;dropped:number;connected:boolean;points:{index:number;x:number;y:number;mode:number;clock24:number;word:string}[]};
 punch:{count:number;dropped:number;connected:boolean;frames:{index:number;frame:number;clock:number}[]};
 pen:{x:number;y:number;radius:number;down:boolean;hits:number};trap:{mode:number;markingDisabled:boolean};
}
export function observeBoard(board:TX2GateBoard|null|undefined,limit?:number):BoardObservation|null;
export const SEQUENCE_UNITS:readonly number[];
export const INOUT_UNITS:readonly number[];
export const INOUT_OPERATIONS:readonly string[];
export function priorityCircuit(b:NetlistBuilder,requests:Bus,payloads:Bus[]):{valid:number;value:Bus};
export interface SequenceControl {
 boundary:number;running:number;commit:number;hold:number;dismiss:number;raise:number;lower:number;
 unit:Bus;events:Bus;p:Bus;placekeepers:Bus[];trapMode:Bus;
}
export interface SequenceActions {
 change:number;target:Bus;targetP:Bus;report:Bus;sleeping:number;intercepted:number;validUnit:number;validK:number;
}
export interface SequenceRegisters {
 K:Bus;flags:Bus;held:number;dismissed:number;limbo:number;tsp:Bus;connect(control:SequenceControl):SequenceActions;
}
export function sequenceRegisters(b:NetlistBuilder,entry:number,options?:{initialFlags?:bigint}):SequenceRegisters;
export interface InoutPorts {
 K:Bus;flags:Bus;unit:Bus;arg:Bus;config:Bus;cf:Bus;word:Bus;is:{OPR:number;TSD:number};
 commit:number;clockEnable:number;referenceEnable:number;markingDisabled:number;
 references:{fetch:number;defer:number;operand:number;meta:number};
}
export interface InoutCircuit {
 events:Bus;initialMemories:Map<string,Map<number,bigint>>;clock:Bus;mode:Bus;mark:number;
 commandFault:number;transferFault:number;retry:number;memoryWrite:number;transferWord:Bus;eWrite:number;eWord:Bus;
 report:Bus;reportEnable:number;lower:number;raise:number;traceDepth:number;dismiss:number;validFlagUnit:number;
}
export function inoutCircuit(b:NetlistBuilder,p:InoutPorts,options?:DeviceOptions):InoutCircuit;
