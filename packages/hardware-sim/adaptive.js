import { ElectricalSimulator } from './electrical.js';

const defaults = Object.freeze({ relativeTolerance: 1e-3, voltageTolerance: 1e-6,
    currentTolerance: 1e-9, minStep: 1e-15, maxTrials: 10000 });
function settings(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some(key => !Object.hasOwn(defaults, key))) throw new Error('Invalid adaptive integration settings');
    const result = { ...defaults, ...value };
    for (const key of ['relativeTolerance', 'voltageTolerance', 'currentTolerance', 'minStep'])
        if (!Number.isFinite(result[key]) || result[key] <= 0) throw new RangeError(`Invalid adaptive ${key}`);
    if (!Number.isInteger(result.maxTrials) || result.maxTrials < 1 || result.maxTrials > 100000)
        throw new RangeError('Invalid adaptive trial budget');
    return Object.freeze(result);
}

/** Backward-Euler step doubling with a transactional observation interval.
 * Each trial compares one full step with two half steps. Accepted values are the
 * two-half-step solution (no extrapolation); the normalized estimate controls
 * internal subdivision. Only the requested endpoint commits public state/history.
 * DAC/ADC sampling and digital clock cadence therefore do not change in mixed
 * mode. The estimator controls local discretization error, not global error or
 * physical device fidelity. A rejected interval leaves all committed state intact.
 * No trial yields or publishes its temporary companion-model state. */
export class AdaptiveElectricalSimulator extends ElectricalSimulator {
    constructor(circuit, options = {}) {
        super(circuit, options);
        const config = circuit.integration ?? { mode: 'fixed' };
        if (!config || typeof config !== 'object' || Array.isArray(config) || !['fixed', 'adaptive'].includes(config.mode))
            throw new Error('Electrical integration mode must be fixed or adaptive');
        const { mode, ...rest } = config;
        this.integration = Object.freeze({ mode, ...settings(rest) });
    }
    step(dt) {
        if (this.integration.mode === 'fixed') return super.step(dt);
        const { mode, ...options } = this.integration;
        return this.stepAdaptive(dt, options);
    }
    /** Integrate exactly dt seconds, using bounded internal substeps as necessary. */
    stepAdaptive(dt, options = {}) {
        const cfg = settings(options), start = this.time, end = start + dt;
        if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(end) || end <= start)
            throw new RangeError('Adaptive interval cannot advance representable time');
        // Independent-source slope changes are exact integration boundaries.
        const breakpoints = [...new Set(this.components.flatMap(component =>
            this.overrides[component.name] === undefined && component.source?.pwl ?
                component.source.pwl.map(point => point[0]).filter(t => t > start && t < end) : []))].sort((a, b) => a - b);
        breakpoints.push(end);
        const committed = this.state;
        let time = start, previous = committed, suggestion = dt, boundary = 0, last = null;
        let trials = 0, acceptedSteps = 0, rejectedSteps = 0, maxNormalizedError = 0, iterations = 0;
        let smallestStep = Infinity, largestStep = 0;
        const solveFrom = (state, length, target) => {
            this.state = state;
            try { const result = this._solve(length, target); iterations += result.iterations; return result; }
            finally { this.state = committed; }
        };
        try {
            while (time < end) {
                while (breakpoints[boundary] <= time) boundary++;
                const limit = breakpoints[boundary], remaining = limit - time;
                let target = suggestion >= remaining ? limit : time + suggestion;
                const length = target - time, middle = time + length / 2;
                if (!(middle > time && middle < target)) throw new Error('Adaptive midpoint cannot advance representable time');
                if (++trials > cfg.maxTrials) throw new Error('Adaptive trial budget exceeded; interval unchanged');
                let fine, error = Infinity, failure = null;
                try {
                    const coarse = solveFrom(previous, length, target);
                    const half = solveFrom(previous, middle - time, middle);
                    fine = solveFrom(half.state, target - middle, target);
                    error = 0;
                    for (let i = 0; i < this.size; i++) {
                        const atol = i < this.nodes.length - 1 ? cfg.voltageTolerance : cfg.currentTolerance;
                        const scale = atol + cfg.relativeTolerance * Math.max(Math.abs(fine.state[i]), Math.abs(coarse.state[i]));
                        error = Math.max(error, Math.abs(fine.state[i] - coarse.state[i]) / scale);
                    }
                } catch (cause) { failure = cause; }
                if (!failure && Number.isFinite(error) && error <= 1) {
                    previous = fine.state; last = fine; time = target; acceptedSteps++;
                    maxNormalizedError = Math.max(maxNormalizedError, error);
                    smallestStep = Math.min(smallestStep, length); largestStep = Math.max(largestStep, length);
                    suggestion = length * (error === 0 ? 2 : Math.min(2, Math.max(0.5, 0.9 / Math.sqrt(error))));
                } else {
                    rejectedSteps++;
                    const factor = failure || !Number.isFinite(error) ? 0.5 : Math.max(0.1, Math.min(0.5, 0.9 / Math.sqrt(error)));
                    const floor = Math.min(cfg.minStep, remaining);
                    if (length <= floor) throw new Error('Adaptive minimum step reached; interval unchanged', { cause: failure });
                    suggestion = Math.max(floor, length * factor);
                    if (!(time + suggestion < target)) throw new Error('Adaptive subdivision cannot make progress; interval unchanged', { cause: failure });
                }
            }
        } finally { this.state = committed; }
        const result = this._commit(last, end);
        return { ...result, integration: { acceptedSteps, rejectedSteps, trials, iterations,
            smallestStep, largestStep, maxNormalizedError, sourceBreakpoints: breakpoints.length - 1 } };
    }
}
