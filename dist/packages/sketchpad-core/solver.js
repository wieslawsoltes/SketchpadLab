/** Sparse forward automatic differentiation, matrix-free damped least-squares.
 * This is a modern reconstruction, not Sutherland's original relaxation code. */
class Dual {
    constructor(v, g = new Map()) { this.v = v; this.g = g; }
}
const d = x => x instanceof Dual ? x : new Dual(x);
function combine(a, b, va, vb, value) {
    a = d(a);
    b = d(b);
    const g = new Map();
    for (const [i, v] of a.g)
        g.set(i, v * va);
    for (const [i, v] of b.g)
        g.set(i, (g.get(i) ?? 0) + v * vb);
    return new Dual(value, g);
}
const add = (a, b) => combine(a, b, 1, 1, d(a).v + d(b).v), sub = (a, b) => combine(a, b, 1, -1, d(a).v - d(b).v);
const mul = (a, b) => combine(a, b, d(b).v, d(a).v, d(a).v * d(b).v);
const div = (a, b) => combine(a, b, 1 / d(b).v, -d(a).v / (d(b).v * d(b).v), d(a).v / d(b).v);
function sqrt(a) { a = d(a); const v = Math.sqrt(Math.max(a.v, 1e-20)); return new Dual(v, new Map([...a.g].map(([i, t]) => [i, t / (2 * v)]))); }
const hypot = (x, y) => sqrt(add(mul(x, x), mul(y, y))), vector = (a, b) => [sub(b[0], a[0]), sub(b[1], a[1])];
const len = v => hypot(v[0], v[1]), cross = (a, b) => sub(mul(a[0], b[1]), mul(a[1], b[0])), dot = (a, b) => add(mul(a[0], b[0]), mul(a[1], b[1]));
export const CONSTRAINT_TYPES = Object.freeze(['horizontal', 'vertical', 'distance', 'coincident', 'fixed', 'parallel', 'perpendicular', 'equalLength', 'lengthRatio', 'pointOnLine', 'pointOnCircle', 'midpoint', 'radius', 'equalRadius', 'arcRadius', 'tangent', 'angle', 'direction', 'instancePoint', 'instanceScale', 'instanceAngle', 'scalarDistance', 'scalarLength', 'scalarRadius', 'scalarEqual', 'scalarRatio', 'scalarDifference', 'scalarTarget']);
function residuals(c, doc, point, instance, scalar) {
    const line = id => {
        const e = doc.entities.get(id);
        if (!e || e.type !== 'line')
            throw new Error(`Constraint ${c.id} requires a line`);
        return [point(e.a), point(e.b)];
    };
    const circle = id => {
        const e = doc.entities.get(id);
        if (!e || !['circle', 'arc'].includes(e.type))
            throw new Error(`Constraint ${c.id} requires a circle or arc`);
        return [point(e.center), point(e.edge ?? e.start)];
    };
    const a = c.refs[0], b = c.refs[1], value = c.value ?? 0;
    switch (c.type) {
        case 'direction': {
            const [p, q] = line(a), v = vector(p, q);
            return [sub(mul(v[1], Math.cos(value)), mul(v[0], Math.sin(value)))];
        }
        case 'instancePoint': {
            const m = instance(a), p = point(c.masterPoint), q = point(b);
            return [sub(add(sub(mul(m[0], p[0]), mul(m[1], p[1])), m[2]), q[0]), sub(add(add(mul(m[1], p[0]), mul(m[0], p[1])), m[3]), q[1])];
        }
        case 'instanceScale': {
            const m = instance(a);
            return [sub(hypot(m[0], m[1]), value)];
        }
        case 'instanceAngle': {
            const m = instance(a), length = hypot(m[0], m[1]);
            return [mul(sub(div(m[0], length), Math.cos(value)), 50), mul(sub(div(m[1], length), Math.sin(value)), 50)];
        }
        case 'scalarDistance': return [sub(len(vector(point(b), point(c.refs[2]))), mul(scalar(a), c.measureScale ?? 1))];
        case 'scalarLength': {
            const [p, q] = line(b);
            return [sub(len(vector(p, q)), mul(scalar(a), c.measureScale ?? 1))];
        }
        case 'scalarRadius': {
            const [p, q] = circle(b);
            return [sub(len(vector(p, q)), mul(scalar(a), c.measureScale ?? 1))];
        }
        case 'scalarTarget': return [sub(scalar(a), value)];
        case 'scalarEqual': return [sub(scalar(a), scalar(b))];
        case 'scalarRatio': return [sub(scalar(a), mul(scalar(b), value))];
        case 'scalarDifference': return [sub(sub(scalar(a), scalar(b)), value)];
        case 'horizontal': {
            const [p, q] = line(a);
            return [sub(q[1], p[1])];
        }
        case 'vertical': {
            const [p, q] = line(a);
            return [sub(q[0], p[0])];
        }
        case 'distance': {
            const [p, q] = c.refs.length === 1 ? line(a) : [point(a), point(b)];
            return [sub(len(vector(p, q)), value)];
        }
        case 'coincident': {
            const p = point(a), q = point(b);
            return [sub(p[0], q[0]), sub(p[1], q[1])];
        }
        case 'fixed': {
            const p = point(a);
            return [sub(p[0], c.x), sub(p[1], c.y)];
        }
        case 'parallel':
        case 'perpendicular':
        case 'angle': {
            const [p, q] = line(a), [r, s] = line(b), v = vector(p, q), w = vector(r, s), den = mul(len(v), len(w));
            if (c.type === 'angle')
                return [mul(sub(div(dot(v, w), den), Math.cos(value)), 50)];
            return [mul(div(c.type === 'parallel' ? cross(v, w) : dot(v, w), den), 50)];
        }
        case 'equalLength':
        case 'lengthRatio': {
            const [p, q] = line(a), [r, s] = line(b);
            return [sub(len(vector(p, q)), mul(c.type === 'equalLength' ? 1 : value, len(vector(r, s))))];
        }
        case 'pointOnLine': {
            const p = point(a), [q, r] = line(b), v = vector(q, r);
            return [div(cross(vector(q, p), v), len(v))];
        }
        case 'pointOnCircle': {
            const p = point(a), [q, r] = circle(b);
            return [sub(len(vector(q, p)), len(vector(q, r)))];
        }
        case 'midpoint': {
            const p = point(a), [q, r] = line(b);
            return [sub(p[0], mul(add(q[0], r[0]), .5)), sub(p[1], mul(add(q[1], r[1]), .5))];
        }
        case 'radius': {
            const [q, r] = circle(a);
            return [sub(len(vector(q, r)), value)];
        }
        case 'equalRadius': {
            const [p, q] = circle(a), [r, s] = circle(b);
            return [sub(len(vector(p, q)), len(vector(r, s)))];
        }
        case 'arcRadius': {
            const e = doc.entities.get(a), p = point(e.center);
            return [sub(len(vector(p, point(e.start))), len(vector(p, point(e.end))))];
        }
        case 'tangent': {
            const [p, q] = line(a), [center, r] = circle(b), v = vector(p, q), signed = div(cross(vector(p, center), v), len(v));
            return [sub(mul(signed, signed), mul(len(vector(center, r)), len(vector(center, r))))];
        }
        default: throw new Error(`Unknown constraint ${c.type}`);
    }
}
const dotArray = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
function pcg(rows, b, lambda, diag) {
    const n = b.length, x = new Float64Array(n), r = b.slice(), z = Float64Array.from(r, (v, i) => v / diag[i]), p = z.slice();
    let rz = dotArray(r, z);
    function apply(v) {
        const out = Float64Array.from(v, t => lambda * t);
        for (const row of rows) {
            let jv = 0;
            for (const [i, g] of row.g)
                jv += g * v[i];
            for (const [i, g] of row.g)
                out[i] += g * jv;
        }
        return out;
    }
    const tolerance = Math.max(1e-24, dotArray(b, b) * 1e-14);
    for (let k = 0; k < Math.min(512, n * 3 + 16) && dotArray(r, r) > tolerance; k++) {
        const ap = apply(p), den = dotArray(p, ap);
        if (Math.abs(den) < 1e-30)
            break;
        const alpha = rz / den;
        for (let i = 0; i < n; i++) {
            x[i] += alpha * p[i];
            r[i] -= alpha * ap[i];
            z[i] = r[i] / diag[i];
        }
        const next = dotArray(r, z), beta = next / rz;
        for (let i = 0; i < n; i++)
            p[i] = z[i] + beta * p[i];
        rz = next;
    }
    return x;
}
function rank(rows, n) {
    if (n > 160 || rows.length > 500)
        return null;
    const a = rows.map(r => {
        const t = new Float64Array(n);
        for (const [i, v] of r.g)
            t[i] = v;
        return t;
    });
    let row = 0;
    for (let col = 0; col < n && row < a.length; col++) {
        let pivot = row;
        for (let j = row + 1; j < a.length; j++)
            if (Math.abs(a[j][col]) > Math.abs(a[pivot][col]))
                pivot = j;
        if (Math.abs(a[pivot][col]) < 1e-8)
            continue;
        [a[pivot], a[row]] = [a[row], a[pivot]];
        const v = a[row][col];
        for (let k = col; k < n; k++)
            a[row][k] /= v;
        for (let j = row + 1; j < a.length; j++) {
            const f = a[j][col];
            for (let k = col; k < n; k++)
                a[j][k] -= f * a[row][k];
        }
        row++;
    }
    return row;
}
export function solveConstraints(doc, { picture = doc.currentPicture, pins = new Map(), instancePins = new Map(), maxIterations = 35, tolerance = 1e-5 } = {}) {
    if (!doc.pictures.has(picture) || !Number.isInteger(maxIterations) || maxIterations < 0 || maxIterations > 1000 || !Number.isFinite(tolerance) || tolerance <= 0)
        throw new RangeError('Invalid solver options');
    for (const [id, pin] of pins)
        if (!doc.points.has(id) || doc.points.get(id).picture !== picture || !Number.isFinite(pin.x) || !Number.isFinite(pin.y))
            throw new Error('Invalid solver pin');
    const points = [...doc.points.values()].filter(p => p.picture === picture), vars = [], indices = new Map();
    for (const p of points) {
        if (pins.has(p.id)) {
            const pin = pins.get(p.id);
            p.x = pin.x;
            p.y = pin.y;
        }
        else if (!p.fixed) {
            indices.set(p.id, vars.length);
            vars.push({ p, key: 'x' }, { p, key: 'y' });
        }
    }
    const constraints = [...doc.constraints.values()].filter(c => c.picture === picture && !c.disabled);
    const instanceIndices = new Map(), scalarIndices = new Map(), constrainedInstances = new Set(constraints.flatMap(c => c.refs.filter(id => doc.entities.get(id)?.type === 'instance')));
    for (const id of constrainedInstances) {
        const e = doc.entities.get(id);
        if (instancePins.has(id)) {
            const m = instancePins.get(id);
            if (!Array.isArray(m) || m.length !== 6 || !m.every(Number.isFinite))
                throw new Error('Invalid instance pin');
            e.matrix = [...m];
        }
        else if (!e.fixed) {
            instanceIndices.set(id, vars.length);
            for (const key of [0, 1, 4, 5])
                vars.push({ p: e.matrix, key });
        }
    }
    for (const v of doc.scalars?.values() ?? [])
        if (v.picture === picture && !v.fixed) {
            scalarIndices.set(v.id, vars.length);
            vars.push({ p: v, key: 'value' });
        }
    const n = vars.length;
    const instance = id => { const e = doc.entities.get(id), i = instanceIndices.get(id); return [0, 1, 4, 5].map((key, j) => i === undefined ? d(e.matrix[key]) : new Dual(e.matrix[key], new Map([[i + j, 1]]))); };
    const scalar = id => { const v = doc.scalars.get(id), i = scalarIndices.get(id); return i === undefined ? d(v.value) : new Dual(v.value, new Map([[i, 1]])); };
    const compute = () => {
        const cache = new Map();
        const point = id => {
            if (cache.has(id))
                return cache.get(id);
            const p = doc.points.get(id);
            if (!p)
                throw new Error(`Missing point ${id}`);
            const i = indices.get(id), v = i === undefined ? [new Dual(p.x), new Dual(p.y)] : [new Dual(p.x, new Map([[i, 1]])), new Dual(p.y, new Map([[i + 1, 1]]))];
            cache.set(id, v);
            return v;
        };
        const rows = [];
        for (const c of constraints)
            for (const r of residuals(c, doc, point, instance, scalar))
                rows.push({ ...r, id: c.id });
        return rows;
    };
    let rows = compute(), cost = rows.reduce((s, r) => s + r.v * r.v, 0), lambda = 1e-3, iterations = 0;
    for (; iterations < maxIterations && n && cost > tolerance * tolerance; iterations++) {
        const b = new Float64Array(n), diag = new Float64Array(n).fill(lambda);
        for (const row of rows)
            for (const [i, g] of row.g) {
                b[i] -= g * row.v;
                diag[i] += g * g;
            }
        const delta = pcg(rows, b, lambda, diag), old = vars.map(({ p, key }) => p[key]);
        if (!delta.every(Number.isFinite))
            break;
        vars.forEach(({ p, key }, i) => { p[key] += delta[i]; });
        const next = compute(), nextCost = next.reduce((s, r) => s + r.v * r.v, 0);
        if (Number.isFinite(nextCost) && nextCost < cost) {
            rows = next;
            const improvement = cost - nextCost;
            cost = nextCost;
            lambda = Math.max(1e-12, lambda * .3);
            if (improvement < 1e-20)
                break;
        }
        else {
            vars.forEach(({ p, key }, i) => { p[key] = old[i]; });
            lambda = Math.min(1e16, lambda * 10);
            if (lambda >= 1e16)
                break;
        }
    }
    for (const id of constrainedInstances) {
        const e = doc.entities.get(id);
        e.matrix[2] = -e.matrix[1];
        e.matrix[3] = e.matrix[0];
    }
    const residualByConstraint = new Map();
    for (const r of rows)
        residualByConstraint.set(r.id, Math.max(residualByConstraint.get(r.id) ?? 0, Math.abs(r.v)));
    const maxResidual = rows.reduce((maximum, row) => Math.max(maximum, Math.abs(row.v)), 0), r = rank(rows, n);
    const result = { converged: maxResidual < tolerance, iterations, cost, maxResidual, variables: n, equations: rows.length, rank: r, degreesOfFreedom: r === null ? null : n - r, residualByConstraint };
    doc.lastSolve = result;
    return result;
}
