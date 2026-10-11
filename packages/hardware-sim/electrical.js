/** Bounded modified-nodal analysis (SI units). Backward-Euler RLC transients,
 * Shockley diodes and Ebers-Moll bipolar junction transistors. Generic models:
 * no parasitic capacitances, breakdown, thermal coupling or TX-2 characterization. */
const finite = (v, name) => { if (!Number.isFinite(v)) throw new RangeError(`Invalid ${name}`); return v; };
const positive = (v, name) => { finite(v, name); if (v <= 0) throw new RangeError(`${name} must be positive`); return v; };
function sourceValue(source, time) {
    if (typeof source === 'number') return source;
    const points = source.pwl;
    if (time <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) if (time <= points[i][0]) {
        const [a, x] = points[i - 1], [b, y] = points[i]; return x + (y - x) * (time - a) / (b - a);
    }
    return points.at(-1)[1];
}
function validateSource(source) {
    if (typeof source === 'number') { finite(source, 'source'); return; }
    if (!Array.isArray(source?.pwl) || source.pwl.length < 1 || source.pwl.length > 10000) throw new Error('Source requires a finite value or bounded PWL points');
    let before = -1;
    for (const point of source.pwl) {
        if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || point[0] < 0 || point[0] <= before) throw new Error('PWL times must strictly increase');
        finite(point[1], 'PWL value'); before = point[0];
    }
}
/** Dense, scaled partial-pivot elimination. Singular circuits fail visibly. */
function solve(matrix, right, n) {
    const a = matrix.slice(), b = right.slice(), scales = new Float64Array(n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) scales[i] = Math.max(scales[i], Math.abs(a[i * n + j]));
    for (let k = 0; k < n; k++) {
        let pivot = k, ratio = 0;
        for (let i = k; i < n; i++) { const r = scales[i] ? Math.abs(a[i * n + k]) / scales[i] : 0; if (r > ratio) { ratio = r; pivot = i; } }
        if (ratio < 1e-14) throw new Error('Singular/ill-conditioned circuit: check floating nodes and ideal-source loops');
        if (pivot !== k) {
            for (let j = k; j < n; j++) [a[k * n + j], a[pivot * n + j]] = [a[pivot * n + j], a[k * n + j]];
            [b[k], b[pivot]] = [b[pivot], b[k]]; [scales[k], scales[pivot]] = [scales[pivot], scales[k]];
        }
        for (let i = k + 1; i < n; i++) {
            const factor = a[i * n + k] / a[k * n + k]; a[i * n + k] = 0;
            for (let j = k + 1; j < n; j++) a[i * n + j] -= factor * a[k * n + j]; b[i] -= factor * b[k];
        }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let v = b[i]; for (let j = i + 1; j < n; j++) v -= a[i * n + j] * x[j]; x[i] = v / a[i * n + i]; finite(x[i], 'solution'); }
    return x;
}
function junction(voltage, saturation, vt) {
    const u = voltage / vt, edge = Math.exp(40);
    // C1 linear continuation keeps intermediate Newton iterates finite. Accepted
    // operating points beyond this model domain are rejected, not claimed physical.
    const exponential = u > 40 ? edge * (1 + u - 40) : Math.exp(u);
    return { i: saturation * (exponential - 1), g: saturation * (u > 40 ? edge : exponential) / vt };
}
export class ElectricalSimulator {
    constructor(circuit, { maxIterations = 100, relativeTolerance = 1e-7, voltageTolerance = 1e-8, currentTolerance = 1e-10, historyLimit = 64 } = {}) {
        if (!Array.isArray(circuit?.nodes) || circuit.nodes[0] !== '0' || circuit.nodes.length < 2 || circuit.nodes.length > 257 ||
            new Set(circuit.nodes).size !== circuit.nodes.length || circuit.nodes.some(n => typeof n !== 'string' || !/^[\w.-]+$/.test(n)) ||
            !Array.isArray(circuit.components) || circuit.components.length > 1024) throw new Error('Invalid circuit or node/component budget');
        if (!Number.isInteger(maxIterations) || maxIterations < 2 || maxIterations > 1000 || !Number.isInteger(historyLimit) || historyLimit < 0 || historyLimit > 1000)
            throw new RangeError('Invalid iteration/history budget');
        this.maxIterations = maxIterations; this.rtol = positive(relativeTolerance, 'relative tolerance');
        this.vtol = positive(voltageTolerance, 'voltage tolerance'); this.itol = positive(currentTolerance, 'current tolerance'); this.historyLimit = historyLimit;
        this.circuit = structuredClone(circuit); this.nodes = this.circuit.nodes; this.components = this.circuit.components;
        const names = new Set(); let branches = 0;
        for (const c of this.components) {
            if (typeof c.name !== 'string' || !/^[\w.-]+$/.test(c.name) || names.has(c.name) || ['__proto__','prototype','constructor'].includes(c.name)) throw new Error('Invalid/duplicate component name'); names.add(c.name);
            if (!['R','C','L','V','I','D','Q'].includes(c.type)) throw new Error(`Unsupported component ${c.type}`);
            const pins = c.type === 'Q' ? ['c','b','e'] : ['p','n'];
            for (const pin of pins) { const index = this.nodes.indexOf(c[pin]); if (index < 0) throw new Error(`Unknown node ${c[pin]}`); c[pin + 'Index'] = index - 1; }
            if (['R','C','L'].includes(c.type)) positive(c.value, c.name);
            if (c.type === 'V' || c.type === 'I') validateSource(c.source);
            if (c.type === 'V' || c.type === 'L') c.branch = this.nodes.length - 1 + branches++;
            if (c.type === 'D' || c.type === 'Q') { c.Is ??= 1e-14; c.vt ??= 0.025852; positive(c.Is, 'Is'); positive(c.vt, 'thermal voltage'); }
            if (c.type === 'Q') {
                c.polarity ??= 'npn'; if (!['npn','pnp'].includes(c.polarity)) throw new Error('Unknown BJT polarity');
                c.betaF ??= 100; c.betaR ??= 1; positive(c.betaF, 'forward beta'); positive(c.betaR, 'reverse beta');
            }
        }
        this.size = this.nodes.length - 1 + branches;
        if (this.size > 512) throw new Error('Matrix budget exceeded');
        this.fingerprint = JSON.stringify(this.circuit); this.state = new Float64Array(this.size);
        this.time = 0; this.history = []; this.overrides = {}; this.iterations = 0; this.residual = 0;
    }
    voltage(node) { const i = this.nodes.indexOf(node); if (i < 0) throw new Error(`Unknown node ${node}`); return i ? this.state[i - 1] : 0; }
    branchCurrent(name) { const c = this.components.find(c => c.name === name); if (c?.branch === undefined) throw new Error('Branch current is available for voltage sources and inductors'); return this.state[c.branch]; }
    setSource(name, value) {
        finite(value, 'source override');
        if (!this.components.some(c => c.name === name && ['V','I'].includes(c.type))) throw new Error('Unknown independent source');
        this.overrides[name] = value; this.history.length = 0;
    }
    _system(guess, dt, targetTime) {
        const n = this.size, a = new Float64Array(n * n), b = new Float64Array(n);
        const add = (i,j,v) => { if (i >= 0 && j >= 0) a[i*n+j] += v; }, rhs = (i,v) => { if (i >= 0) b[i] += v; };
        const voltage = (x,i) => i < 0 ? 0 : x[i];
        const conductance = (p,q,g) => { add(p,p,g); add(q,q,g); add(p,q,-g); add(q,p,-g); };
        const current = (p,q,i) => { rhs(p,-i); rhs(q,i); };
        const nonlinear = (row, value, derivatives) => {
            let constant = value; for (const [pin, derivative] of derivatives) { add(row,pin,derivative); constant -= derivative * voltage(guess,pin); } rhs(row,-constant);
        };
        for (const c of this.components) {
            const p = c.pIndex, q = c.nIndex, v = c.type === 'Q' ? 0 : voltage(guess,p) - voltage(guess,q);
            switch (c.type) {
                case 'R': conductance(p,q,1/c.value); break;
                case 'I': current(p,q,this.overrides[c.name] ?? sourceValue(c.source,targetTime)); break;
                case 'C': if (dt) { const g = c.value/dt; conductance(p,q,g); current(p,q,-g*(voltage(this.state,p)-voltage(this.state,q))); } break;
                case 'V': case 'L': {
                    const k = c.branch; add(p,k,1); add(q,k,-1); add(k,p,1); add(k,q,-1);
                    if (c.type === 'V') rhs(k,this.overrides[c.name] ?? sourceValue(c.source,targetTime));
                    else if (dt) { add(k,k,-c.value/dt); rhs(k,-c.value/dt*this.state[k]); } break;
                }
                case 'D': { const d = junction(v,c.Is,c.vt); conductance(p,q,d.g); current(p,q,d.i-d.g*v); break; }
                case 'Q': {
                    const s = c.polarity === 'npn' ? 1 : -1, cb = c.bIndex, cc = c.cIndex, ce = c.eIndex;
                    const f = junction(s*(voltage(guess,cb)-voltage(guess,ce)),c.Is,c.vt);
                    const r = junction(s*(voltage(guess,cb)-voltage(guess,cc)),c.Is,c.vt);
                    const af = c.betaF/(c.betaF+1), ar = c.betaR/(c.betaR+1);
                    nonlinear(cc,s*(af*f.i-r.i),[[cb,af*f.g-r.g],[ce,-af*f.g],[cc,r.g]]);
                    nonlinear(ce,s*(-f.i+ar*r.i),[[cb,-f.g+ar*r.g],[ce,f.g],[cc,-ar*r.g]]);
                    nonlinear(cb,s*((1-af)*f.i+(1-ar)*r.i),[[cb,(1-af)*f.g+(1-ar)*r.g],[ce,-(1-af)*f.g],[cc,-(1-ar)*r.g]]); break;
                }
            }
        }
        return { a,b };
    }
    _solve(dt, targetTime) {
        let guess = this.state.slice();
        const nonlinear = this.components.some(c => c.type === 'D' || c.type === 'Q');
        for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
            const {a,b} = this._system(guess,dt,targetTime), candidate = solve(a,b,this.size);
            let scale = 1;
            if (nonlinear) {
                const delta = pin => pin < 0 ? 0 : candidate[pin]-guess[pin];
                for (const c of this.components) for (const [p,q] of c.type === 'D' ? [[c.pIndex,c.nIndex]] : c.type === 'Q' ? [[c.bIndex,c.eIndex],[c.bIndex,c.cIndex]] : [])
                    scale = Math.min(scale,0.25/Math.max(0.25,Math.abs(delta(p)-delta(q))));
            }
            let change = 0;
            for (let i = 0; i < this.size; i++) {
                candidate[i] = guess[i]+scale*(candidate[i]-guess[i]);
                change = Math.max(change,Math.abs(candidate[i]-guess[i])/((i < this.nodes.length-1 ? this.vtol : this.itol)+this.rtol*Math.max(Math.abs(candidate[i]),Math.abs(guess[i]))));
            }
            const system = this._system(candidate,dt,targetTime); let residual = 0;
            for (let i = 0; i < this.size; i++) {
                let error = -system.b[i], magnitude = Math.abs(system.b[i]);
                for (let j = 0; j < this.size; j++) { const term = system.a[i*this.size+j]*candidate[j]; error += term; magnitude += Math.abs(term); }
                residual = Math.max(residual,Math.abs(error)/((i < this.nodes.length-1 ? this.itol : this.vtol)+this.rtol*magnitude));
            }
            if (change <= 1 && residual <= 1) {
                const v = pin => pin < 0 ? 0 : candidate[pin];
                for (const c of this.components) {
                    const s = c.polarity === 'pnp' ? -1 : 1;
                    const junctions = c.type === 'D' ? [v(c.pIndex)-v(c.nIndex)] : c.type === 'Q' ? [s*(v(c.bIndex)-v(c.eIndex)),s*(v(c.bIndex)-v(c.cIndex))] : [];
                    if (junctions.some(u => u/c.vt > 40)) throw new Error('Junction outside characterized exponential model domain');
                }
                return { state: candidate, iterations: iteration, residual };
            }
            guess = candidate;
        }
        throw new Error(`Nonlinear solve did not converge after ${this.maxIterations} iterations; state unchanged`);
    }
    _commit(result, time) {
        if (this.historyLimit) { this.history.push(this.snapshot()); if (this.history.length > this.historyLimit) this.history.shift(); }
        this.state = result.state; this.time = time; this.iterations = result.iterations; this.residual = result.residual;
        return { time, iterations: this.iterations, normalizedResidual: this.residual, voltages: Object.fromEntries(this.nodes.map(n => [n,this.voltage(n)])) };
    }
    operatingPoint() { return this._commit(this._solve(0,this.time),this.time); }
    step(dt) { positive(dt,'time step'); const target = this.time+dt; if (!Number.isFinite(target) || target <= this.time) throw new Error('Time step cannot advance representable time'); return this._commit(this._solve(dt,target),target); }
    run(duration, dt, maxSteps = 100000) {
        positive(duration,'duration'); positive(dt,'step');
        if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100000) throw new RangeError('Invalid step budget');
        const end = this.time+duration; finite(end,'end time'); const rows = []; let steps = 0;
        while (this.time < end) {
            if (++steps > maxSteps) throw new Error('Transient step budget exceeded; accepted steps retained');
            let target = Math.min(end,this.time+dt);
            for (const c of this.components) if (c.source?.pwl && this.overrides[c.name] === undefined)
                for (const [t] of c.source.pwl) if (t > this.time && t < target) { target = t; break; }
            rows.push(this.step(target-this.time));
        }
        return rows;
    }
    snapshot() { return { schema:'hardware-electrical-1', fingerprint:this.fingerprint, time:this.time, state:this.state.slice(), overrides:{...this.overrides}, iterations:this.iterations, residual:this.residual }; }
    restore(s) {
        if (s?.schema !== 'hardware-electrical-1' || s.fingerprint !== this.fingerprint || !Number.isFinite(s.time) || s.time < 0 ||
            !(Array.isArray(s.state) || ArrayBuffer.isView(s.state)) || s.state.length !== this.size || Array.from(s.state).some(v => !Number.isFinite(v)) ||
            !s.overrides || typeof s.overrides !== 'object' || !Number.isInteger(s.iterations) || s.iterations < 0 || s.iterations > this.maxIterations ||
            !Number.isFinite(s.residual) || s.residual < 0) throw new Error('Invalid electrical snapshot');
        for (const [name,value] of Object.entries(s.overrides)) if (!Number.isFinite(value) || !this.components.some(c => c.name === name && ['V','I'].includes(c.type))) throw new Error('Invalid source override');
        this._restore(s); this.history.length = 0;
    }
    _restore(s) { this.time=s.time; this.state=Float64Array.from(s.state); this.overrides={...s.overrides}; this.iterations=s.iterations; this.residual=s.residual; }
    back() { const s=this.history.pop(); if (!s) return false; this._restore(s); return true; }
}
