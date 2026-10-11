import { ElectricalSimulator } from './index.js';
import type { ElectricalCircuit, ElectricalOptions, ElectricalResult } from './index.js';
export interface AdaptiveIntegrationOptions {
    relativeTolerance?:number; voltageTolerance?:number; currentTolerance?:number;
    minStep?:number; maxTrials?:number;
}
export interface AdaptiveCircuit extends ElectricalCircuit {
    integration?: AdaptiveIntegrationOptions & {mode:'fixed'|'adaptive'};
}
export interface AdaptiveIntegrationResult extends ElectricalResult {
    integration:{acceptedSteps:number;rejectedSteps:number;trials:number;iterations:number;
        smallestStep:number;largestStep:number;maxNormalizedError:number;sourceBreakpoints:number};
}
/** Error-controlled internal integration preserves the requested external sampling interval. */
export class AdaptiveElectricalSimulator extends ElectricalSimulator {
    constructor(circuit:AdaptiveCircuit,options?:ElectricalOptions);
    readonly integration:Readonly<Required<AdaptiveIntegrationOptions> & {mode:'fixed'|'adaptive'}>;
    step(dt:number):ElectricalResult|AdaptiveIntegrationResult;
    stepAdaptive(dt:number,options?:AdaptiveIntegrationOptions):AdaptiveIntegrationResult;
}
