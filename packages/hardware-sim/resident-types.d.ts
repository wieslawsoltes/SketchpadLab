import type {DigitalSimulator, GPUOptions, WaveSample} from './index.js';
export interface ResidentOptions extends GPUOptions {
    probes?:string[];
    /** Requested capacity, further bounded by circuit work and journal budgets. */
    maxBatch?:number;
    maxJournalBytes?:number;
}
export interface ResidentRunOptions {
    stop?:boolean;
    breakpoint?:number|null;
    /** Stop at a board instruction boundary after this retired counter changes. */
    retired?:number|null;
}
export interface ResidentResult {executed:number;reason:'budget'|'halt'|'condition';ticks:number;samples:WaveSample[]}
export interface ResidentStats {
    backend:'webgpu-resident';batchCapacity:number;dispatches:number;evaluations:number;
    uploadedBytes:number;readbackBytes:number;gatesPerSettle:number;scheduleLevels:number;addressGates:number;
    adapter:{vendor:string;architecture:string;description:string;isFallbackAdapter:boolean|null}|null;
}
/** Gates, registers, RAM and gate-built peripherals advance in GPU storage.
 * One bounded batch uses one workgroup/dispatch. A validated journal updates the
 * host inspection mirror. Device errors reject the entire submitted batch.
 * This model is logical hardware, not transistor-accurate historic circuitry. */
export class GPUResidentSimulator {
    static create(simulator:DigitalSimulator,options?:ResidentOptions):Promise<GPUResidentSimulator>;
    constructor(simulator:DigitalSimulator,device:object,options?:Omit<ResidentOptions,'gpu'>);
    readonly backend:'webgpu-resident';simulator:DigitalSimulator;busy:boolean;failure:Error|null;
    batchCapacity:number;dispatches:number;evaluations:number;uploadedBytes:number;readbackBytes:number;
    initialize():Promise<void>;
    /** Call after direct raw typed-array edits. Public simulator mutations do this automatically. */
    invalidate():void;
    run(budget?:number,options?:ResidentRunOptions):Promise<ResidentResult>;
    clock():Promise<number>;stats():ResidentStats;dispose():void;
}
