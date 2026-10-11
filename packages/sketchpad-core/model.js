import { RingArena } from './rings.js';
import { solveConstraints, CONSTRAINT_TYPES } from './solver.js';
const finite = v => Number.isFinite(v) && Math.abs(v) <= 1e9;
export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
export function multiply(a, b) { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
export function transform(m, p) { return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }; }
export function pointReferences(e) { return e.type === 'line' ? [e.a, e.b] : e.type === 'circle' ? [e.center, e.edge] : e.type === 'arc' ? [e.center, e.start, e.end] : ['text', 'number'].includes(e.type) ? [e.position] : []; }
export class SketchDocument {
    constructor() { this.nextId = 1; this.scalars = new Map(); this.points = new Map(); this.entities = new Map(); this.constraints = new Map(); this.pictures = new Map(); this.history = []; this.future = []; this.listeners = new Set(); this.currentPicture = this.picture('PICTURE 01'); this.lastSolve = null; this.rebuildRings(); }
    id() { return this.nextId++; }
    picture(name) { const id = this.id(); this.pictures.set(id, { id, name: String(name).slice(0, 120) }); return id; }
    point(x, y, { picture = this.currentPicture, fixed = false, tie = false } = {}) {
        if (!finite(x) || !finite(y) || !this.pictures.has(picture))
            throw new Error('Invalid point');
        const id = this.id();
        this.points.set(id, { id, picture, x, y, fixed: !!fixed, tie: !!tie });
        return id;
    }
    entity(type, properties = {}) { const id = this.id(); this.entities.set(id, { picture: this.currentPicture, ...properties, id, type }); return id; }
    line(a, b) { return this.entity('line', { a, b }); }
    circle(center, edge) { return this.entity('circle', { center, edge }); }
    arc(center, start, end) { const id = this.entity('arc', { center, start, end, ccw: true }); this.constraint('arcRadius', [id]); return id; }
    text(position, text = 'SKETCHPAD', size = 18) { return this.entity('text', { position, text: String(text).slice(0, 10000), size }); }
    scalar(value = 0, { picture = this.currentPicture, fixed = false } = {}) {
        if (!finite(value) || !this.pictures.has(picture))
            throw new Error('Invalid scalar');
        const id = this.id();
        this.scalars.set(id, { id, picture, value, fixed: !!fixed });
        return id;
    }
    number(position, scalar = this.scalar(), { size = 18, digits = 5, decimals = 0 } = {}) {
        if (!this.scalars.has(scalar))
            throw new Error('Unknown scalar');
        return this.entity('number', { position, scalar, size, digits, decimals });
    }
    attachInstance(instanceId, masterPoint, hostPoint = null) {
        const e = this.entities.get(instanceId), p = this.points.get(masterPoint);
        if (e?.type !== 'instance' || p?.picture !== e.master)
            throw new Error('Attacher must belong to the instance master');
        if (hostPoint === null) {
            const q = transform(e.matrix, p);
            hostPoint = this.point(q.x, q.y, { picture: e.picture });
        }
        if (this.points.get(hostPoint)?.picture !== e.picture)
            throw new Error('Host attacher belongs to another picture');
        const existing = [...this.constraints.values()].find(c => c.type === 'instancePoint' && c.refs[0] === instanceId && c.masterPoint === masterPoint);
        if (existing) {
            if (existing.refs[1] !== hostPoint)
                this.mergePoints(existing.refs[1], hostPoint);
            return hostPoint;
        }
        this.constraint('instancePoint', [instanceId, hostPoint], { picture: e.picture, masterPoint });
        return hostPoint;
    }
    instanceAttachers(instanceId) { return [...this.constraints.values()].filter(c => c.type === 'instancePoint' && c.refs[0] === instanceId).map(c => ({ masterPoint: c.masterPoint, point: c.refs[1], constraint: c.id })); }
    constraint(type, refs, extra = {}) {
        if (!CONSTRAINT_TYPES.includes(type))
            throw new Error(`Unknown constraint type ${type}`);
        const id = this.id();
        this.constraints.set(id, { picture: this.currentPicture, ...extra, id, type, refs: [...refs] });
        return id;
    }
    instance(master, x, y, scale = 1, angle = 0) {
        if (!this.pictures.has(master))
            throw new Error('Unknown master');
        if (this.reaches(master, this.currentPicture))
            throw new Error('Recursive picture instance prohibited');
        const c = Math.cos(angle) * scale, s = Math.sin(angle) * scale;
        const id = this.entity('instance', { master, matrix: [c, s, -s, c, x, y] });
        for (const p of [...this.points.values()])
            if (p.picture === master && p.tie)
                this.attachInstance(id, p.id);
        return id;
    }
    reaches(from, target, seen = new Set()) {
        if (from === target)
            return true;
        if (seen.has(from))
            return false;
        seen.add(from);
        return [...this.entities.values()].some(e => e.picture === from && e.type === 'instance' && this.reaches(e.master, target, seen));
    }
    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    changed(label) {
        this.rebuildRings();
        for (const l of this.listeners)
            l({ label, document: this });
    }
    beginEdit(label) {
        if (this.edit)
            throw new Error('Nested document edit');
        this.edit = { label, before: this.serialize() };
    }
    endEdit() {
        if (!this.edit)
            return;
        const { label, before } = this.edit;
        this.edit = null;
        const after = this.serialize();
        if (before !== after) {
            this.history.push({ label, before, after });
            if (this.history.length > 100)
                this.history.shift();
            this.future = [];
        }
        this.changed(label);
    }
    cancelEdit() {
        if (!this.edit)
            return;
        const before = this.edit.before;
        this.edit = null;
        this.restore(before);
        this.changed('cancel');
    }
    transaction(label, fn, { solve = true } = {}) {
        this.beginEdit(label);
        try {
            const result = fn();
            this.validate();
            if (solve)
                this.solve();
            this.endEdit();
            return result;
        }
        catch (e) {
            this.cancelEdit();
            throw e;
        }
    }
    undo() {
        const h = this.history.pop();
        if (!h)
            return false;
        this.restore(h.before);
        this.future.push(h);
        this.solve();
        this.changed(`undo ${h.label}`);
        return true;
    }
    redo() {
        const h = this.future.pop();
        if (!h)
            return false;
        this.restore(h.after);
        this.history.push(h);
        this.solve();
        this.changed(`redo ${h.label}`);
        return true;
    }
    solve(options = {}) {
        const root = options.picture ?? this.currentPicture, result = solveConstraints(this, options), completed = new Set([root]);
        // Definitions first, owners later. A master edit propagates to attached host geometry.
        const affected = new Set([root]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const e of this.entities.values())
                if (e.type === 'instance' && affected.has(e.master) && !affected.has(e.picture)) {
                    affected.add(e.picture);
                    changed = true;
                }
        }
        const visit = (id, path = new Set()) => {
            if (completed.has(id))
                return;
            if (path.has(id))
                throw new Error('Cyclic picture graph');
            path.add(id);
            for (const e of this.entities.values())
                if (e.picture === id && e.type === 'instance' && affected.has(e.master))
                    visit(e.master, path);
            path.delete(id);
            for (const c of this.constraints.values())
                if (c.picture === id && c.type === 'instancePoint') {
                    const e = this.entities.get(c.refs[0]), point = this.points.get(c.refs[1]), master = this.points.get(c.masterPoint);
                    if (e && master && point && !point.fixed && affected.has(e.master))
                        Object.assign(point, transform(e.matrix, master));
                }
            solveConstraints(this, { picture: id, maxIterations: options.maxIterations ?? 35, tolerance: options.tolerance ?? 1e-5 });
            completed.add(id);
        };
        for (const id of affected)
            visit(id);
        this.lastSolve = result;
        return result;
    }
    serialize() { return JSON.stringify({ format: 'sketchpad-lab/1', scalars: [...this.scalars.values()], nextId: this.nextId, currentPicture: this.currentPicture, pictures: [...this.pictures.values()], points: [...this.points.values()], entities: [...this.entities.values()], constraints: [...this.constraints.values()] }); }
    restore(text) {
        const d = typeof text === 'string' ? JSON.parse(text) : structuredClone(text);
        if (d && d.scalars === undefined)
            d.scalars = [];
        if (d.format !== 'sketchpad-lab/1')
            throw new Error('Unknown drawing format');
        for (const key of ['pictures', 'points', 'entities', 'constraints', 'scalars'])
            if (!Array.isArray(d[key]) || d[key].length > 100000)
                throw new Error('Invalid or oversized drawing');
        const previous = { scalars: this.scalars, nextId: this.nextId, currentPicture: this.currentPicture, pictures: this.pictures, points: this.points, entities: this.entities, constraints: this.constraints };
        try {
            for (const k of ['pictures', 'points', 'entities', 'constraints', 'scalars']) {
                this[k] = new Map(d[k].map(v => [v.id, v]));
                if (this[k].size !== d[k].length)
                    throw new Error('Duplicate object ID');
            }
            this.nextId = d.nextId;
            this.currentPicture = d.currentPicture;
            this.validate();
            this.lastSolve = null;
            this.rebuildRings();
        }
        catch (e) {
            Object.assign(this, previous);
            throw e;
        }
    }
    validate() {
        if (!this.pictures.has(this.currentPicture))
            throw new Error('Missing current picture');
        const ids = new Set();
        let max = 0;
        for (const collection of [this.pictures, this.points, this.entities, this.constraints, this.scalars])
            for (const [id, o] of collection) {
                if (!o || o.id !== id || !Number.isSafeInteger(id) || id <= 0 || ids.has(id))
                    throw new Error('Invalid/nonunique object ID');
                ids.add(id);
                max = Math.max(max, id);
                if (o.picture !== undefined && !this.pictures.has(o.picture))
                    throw new Error('Missing picture owner');
            }
        if (!Number.isSafeInteger(this.nextId) || this.nextId <= max || this.nextId > 0xffffffff)
            throw new Error('Invalid allocation watermark');
        for (const p of this.pictures.values())
            if (typeof p.name !== 'string' || p.name.length > 120)
                throw new Error('Invalid picture name');
        for (const p of this.points.values())
            if (!this.pictures.has(p.picture) || !finite(p.x) || !finite(p.y))
                throw new Error('Invalid point or owner');
        for (const e of this.entities.values()) {
            if (!this.pictures.has(e.picture) || !['line', 'circle', 'arc', 'text', 'number', 'instance'].includes(e.type))
                throw new Error(`Unsupported entity type ${e.type}`);
            for (const id of pointReferences(e)) {
                const p = this.points.get(id);
                if (!p || p.picture !== e.picture)
                    throw new Error('Entity references missing/foreign point');
            }
            if (e.type === 'instance') {
                if (!this.pictures.has(e.master) || !Array.isArray(e.matrix) || e.matrix.length !== 6 || !e.matrix.every(finite) || Math.abs(e.matrix[0] * e.matrix[3] - e.matrix[1] * e.matrix[2]) < 1e-12)
                    throw new Error('Invalid instance');
                if (this.reaches(e.master, e.picture))
                    throw new Error('Cyclic picture graph');
            }
            if (e.type === 'text' && (typeof e.text !== 'string' || e.text.length > 10000 || !finite(e.size) || e.size <= 0))
                throw new Error('Invalid text');
        }
        for (const scalar of this.scalars.values())
            if (!this.pictures.has(scalar.picture) || !finite(scalar.value))
                throw new Error('Invalid scalar');
        for (const e of this.entities.values())
            if (e.type === 'number') {
                if (this.scalars.get(e.scalar)?.picture !== e.picture || !finite(e.size) || e.size <= 0 || !Number.isInteger(e.digits) || e.digits < 1 || e.digits > 16 || !Number.isInteger(e.decimals) || e.decimals < 0 || e.decimals > 10)
                    throw new Error('Invalid numeric display');
            }
        for (const c of this.constraints.values()) {
            if (!this.pictures.has(c.picture) || !CONSTRAINT_TYPES.includes(c.type) || !Array.isArray(c.refs))
                throw new Error('Invalid constraint');
            const shapes = { horizontal: ['line'], vertical: ['line'], distance: c.refs.length === 1 ? ['line'] : ['point', 'point'], coincident: ['point', 'point'], fixed: ['point'], parallel: ['line', 'line'], perpendicular: ['line', 'line'], equalLength: ['line', 'line'], lengthRatio: ['line', 'line'], pointOnLine: ['point', 'line'], pointOnCircle: ['point', 'circle'], midpoint: ['point', 'line'], radius: ['circle'], equalRadius: ['circle', 'circle'], arcRadius: ['arc'], tangent: ['line', 'circle'], angle: ['line', 'line'] };
            Object.assign(shapes, { direction: ['line'], instancePoint: ['instance', 'point'], instanceScale: ['instance'], instanceAngle: ['instance'], scalarDistance: ['scalar', 'point', 'point'], scalarLength: ['scalar', 'line'], scalarRadius: ['scalar', 'circle'], scalarEqual: ['scalar', 'scalar'], scalarRatio: ['scalar', 'scalar'], scalarDifference: ['scalar', 'scalar'], scalarTarget: ['scalar'] });
            if (c.measureScale !== undefined && (!finite(c.measureScale) || c.measureScale <= 0))
                throw new Error('Invalid scalar measurement scale');
            const expected = shapes[c.type];
            if (c.refs.length !== expected.length)
                throw new Error('Invalid constraint arity');
            c.refs.forEach((id, i) => {
                const o = this.entities.get(id) ?? this.points.get(id) ?? this.scalars.get(id), kind = expected[i];
                if (!o || o.picture !== c.picture)
                    throw new Error('Constraint references missing/foreign object');
                const valid = kind === 'scalar' ? this.scalars.has(id) : kind === 'point' ? this.points.has(id) : kind === 'circle' ? ['circle', 'arc'].includes(o.type) : o.type === (kind === 'line' ? 'line' : kind);
                if (!valid)
                    throw new Error(`Constraint ${c.type} requires ${kind} at reference ${i + 1}`);
            });
            if (['distance', 'radius', 'lengthRatio', 'angle', 'direction', 'instanceScale', 'instanceAngle', 'scalarTarget', 'scalarRatio', 'scalarDifference'].includes(c.type) && !finite(c.value))
                throw new Error('Missing or invalid constraint target');
            if (c.value !== undefined && !finite(c.value))
                throw new Error('Invalid constraint target');
            if (['distance', 'radius'].includes(c.type) && c.value < 0 || c.type === 'lengthRatio' && c.value <= 0)
                throw new Error('Constraint target must have a valid geometric magnitude');
            if (c.type === 'instancePoint') {
                const e = this.entities.get(c.refs[0]);
                if (this.points.get(c.masterPoint)?.picture !== e.master)
                    throw new Error('Invalid instance master point');
                if (Math.abs(e.matrix[0] - e.matrix[3]) > 1e-8 || Math.abs(e.matrix[1] + e.matrix[2]) > 1e-8)
                    throw new Error('Constrained instances require a similarity transform');
            }
            if (c.type === 'instanceScale' && c.value <= 0)
                throw new Error('Instance scale must be positive');
            if (c.type === 'fixed' && (!finite(c.x) || !finite(c.y)))
                throw new Error('Invalid fixed coordinate');
        }
        return true;
    }
    rebuildRings() {
        this.rings = new RingArena(Math.max(256, (this.entities.size + this.points.size) * 6));
        this.pictureRings = new Map();
        this.pointRings = new Map();
        this.constraintRings = new Map();
        for (const id of this.pictures.keys())
            this.pictureRings.set(id, this.rings.create());
        for (const id of this.points.keys())
            this.pointRings.set(id, this.rings.create());
        for (const e of this.entities.values()) {
            this.rings.insert(this.pictureRings.get(e.picture), e.id);
            for (const p of pointReferences(e))
                this.rings.insert(this.pointRings.get(p), e.id);
        }
        for (const c of this.constraints.values()) {
            const a = this.rings.create();
            this.constraintRings.set(c.id, a);
            for (const id of c.refs)
                this.rings.insert(a, id);
        }
    }
    remove(ids) {
        const removed = new Set(ids);
        for (const e of this.entities.values())
            if (pointReferences(e).some(id => removed.has(id)) || (e.type === 'number' && removed.has(e.scalar)))
                removed.add(e.id);
        for (const id of removed) {
            this.entities.delete(id);
            this.points.delete(id);
            this.constraints.delete(id);
            this.scalars.delete(id);
        }
        for (const c of this.constraints.values())
            if (c.refs.some(id => removed.has(id)) || removed.has(c.masterPoint))
                this.constraints.delete(c.id);
        this.garbageCollect();
    }
    garbageCollect() {
        const used = new Set();
        for (const e of this.entities.values())
            pointReferences(e).forEach(id => used.add(id));
        for (const c of this.constraints.values())
            c.refs.filter(id => this.points.has(id)).forEach(id => used.add(id));
        for (const [id, p] of this.points)
            if (!used.has(id) && !p.tie && ![...this.constraints.values()].some(c => c.masterPoint === id))
                this.points.delete(id);
    }
    mergePoints(source, target) {
        if (source === target)
            return;
        const s = this.points.get(source), t = this.points.get(target);
        if (!s || !t || s.picture !== t.picture)
            throw new Error('Points must belong to same picture');
        for (const e of this.entities.values())
            for (const key of ['a', 'b', 'center', 'edge', 'start', 'end', 'position'])
                if (e[key] === source)
                    e[key] = target;
        for (const c of this.constraints.values()) {
            c.refs = c.refs.map(id => id === source ? target : id);
            if (c.masterPoint === source)
                c.masterPoint = target;
        }
        t.tie ||= s.tie;
        this.points.delete(source);
    }
    createMaster(ids, name = 'MASTER') {
        const entities = ids.map(id => this.entities.get(id)).filter(Boolean), master = this.picture(name), map = new Map();
        const point = id => {
            if (!map.has(id)) {
                const p = this.points.get(id);
                map.set(id, this.point(p.x, p.y, { ...p, picture: master }));
            }
            return map.get(id);
        };
        const entityMap = new Map();
        for (const e of entities) {
            const out = { ...e, id: this.id(), picture: master };
            if (e.matrix)
                out.matrix = [...e.matrix];
            if (e.type === 'number') {
                const scalar = this.scalars.get(e.scalar);
                if (!map.has(e.scalar))
                    map.set(e.scalar, this.scalar(scalar.value, { picture: master, fixed: scalar.fixed }));
                out.scalar = map.get(e.scalar);
            }
            for (const key of ['a', 'b', 'center', 'edge', 'start', 'end', 'position'])
                if (e[key] !== undefined)
                    out[key] = point(e[key]);
            this.entities.set(out.id, out);
            entityMap.set(e.id, out.id);
        }
        for (const c of [...this.constraints.values()])
            if (c.refs.every(id => map.has(id) || entityMap.has(id))) {
                const out = { ...c, id: this.id(), picture: master, refs: c.refs.map(id => map.get(id) ?? entityMap.get(id)) };
                this.constraints.set(out.id, out);
            }
        return master;
    }
    changeInstance(id, master) {
        const e = this.entities.get(id);
        if (e?.type !== 'instance' || !this.pictures.has(master))
            throw new Error('Invalid instance replacement');
        if (this.reaches(master, e.picture))
            throw new Error('Cyclic instance replacement');
        const old = this.instanceAttachers(id), ties = [...this.points.values()].filter(p => p.picture === master && p.tie);
        for (const attacher of old)
            this.constraints.delete(attacher.constraint);
        e.master = master;
        ties.forEach((p, i) => { const point = this.attachInstance(id, p.id, old[i]?.point ?? null), host = this.points.get(point); if (!host.fixed)
            Object.assign(host, transform(e.matrix, p)); });
        return id;
    }
    copyDefinition(master, { x = 0, y = 0, targets = [] } = {}) {
        if (!this.pictures.has(master) || this.reaches(master, this.currentPicture))
            throw new Error('Invalid definition');
        const ties = [...this.points.values()].filter(p => p.picture === master && p.tie), pairs = targets.map((id, i) => [ties[i], this.points.get(id)]);
        if (pairs.some(([a, b]) => !a || b?.picture !== this.currentPicture))
            throw new Error('Definition ties require matching host points');
        let a = 1, b = 0, tx = x, ty = y;
        if (pairs.length) {
            const count = pairs.length, m = pairs.reduce((sum, [p, q]) => [sum[0] + p.x / count, sum[1] + p.y / count, sum[2] + q.x / count, sum[3] + q.y / count], [0, 0, 0, 0]);
            if (count > 1) {
                let den = 0, re = 0, im = 0;
                for (const [p, q] of pairs) {
                    const u = p.x - m[0], v = p.y - m[1], r = q.x - m[2], s = q.y - m[3];
                    den += u * u + v * v;
                    re += u * r + v * s;
                    im += u * s - v * r;
                }
                if (den < 1e-16)
                    throw new Error('Coincident definition ties cannot determine a transform');
                a = re / den;
                b = im / den;
                if (a * a + b * b < 1e-16)
                    throw new Error('Definition fit collapses its geometry');
            }
            tx = m[2] - a * m[0] + b * m[1];
            ty = m[3] - b * m[0] - a * m[1];
        }
        const instance = this.instance(master, tx, ty, Math.hypot(a, b), Math.atan2(b, a)), attached = this.instanceAttachers(instance);
        targets.forEach((id, i) => this.mergePoints(attached[i].point, id));
        return this.explode(instance);
    }
    explode(id) {
        const instance = this.entities.get(id);
        if (instance?.type !== 'instance')
            throw new Error('Select an instance to dismember');
        const m = instance.matrix, scale = Math.hypot(m[0], m[1]), angle = Math.atan2(m[1], m[0]);
        if (Math.abs(m[0] - m[3]) > 1e-8 || Math.abs(m[1] + m[2]) > 1e-8)
            throw new Error('Dismember with constraint preservation requires a similarity transform');
        const map = new Map(), created = [], members = [...this.entities.values()].filter(e => e.picture === instance.master), constraints = [...this.constraints.values()].filter(c => c.picture === instance.master);
        const clonePoint = id => { if (!map.has(id)) {
            const source = this.points.get(id), p = transform(m, source);
            map.set(id, this.point(p.x, p.y, { picture: instance.picture, tie: false, fixed: false }));
        } return map.get(id); };
        for (const c of this.instanceAttachers(id))
            map.set(c.masterPoint, c.point);
        for (const scalar of [...this.scalars.values()])
            if (scalar.picture === instance.master)
                map.set(scalar.id, this.scalar(scalar.value, { picture: instance.picture, fixed: scalar.fixed }));
        for (const e of members) {
            const out = { ...e, id: this.id(), picture: instance.picture };
            map.set(e.id, out.id);
            if (e.type === 'instance')
                out.matrix = multiply(m, e.matrix);
            else
                for (const key of ['a', 'b', 'center', 'edge', 'start', 'end', 'position'])
                    if (e[key] !== undefined)
                        out[key] = clonePoint(e[key]);
            if (e.type === 'text' || e.type === 'number') {
                out.size *= scale;
                out.angle = (e.angle ?? 0) + angle;
            }
            if (e.type === 'number') {
                const scalar = this.scalars.get(e.scalar);
                if (!map.has(e.scalar))
                    map.set(e.scalar, this.scalar(scalar.value, { picture: instance.picture, fixed: scalar.fixed }));
                out.scalar = map.get(e.scalar);
            }
            this.entities.set(out.id, out);
            created.push(out.id);
        }
        for (const c of constraints) {
            if (!c.refs.every(ref => map.has(ref)))
                continue;
            const out = { ...c, id: this.id(), picture: instance.picture, refs: c.refs.map(ref => map.get(ref)) };
            if (c.type === 'horizontal' || c.type === 'vertical') {
                out.type = 'direction';
                out.value = angle + (c.type === 'vertical' ? Math.PI / 2 : 0);
            }
            if (c.type === 'direction' || c.type === 'instanceAngle')
                out.value = c.value + angle;
            if (['distance', 'radius', 'instanceScale'].includes(c.type))
                out.value = c.value * scale;
            if (c.type === 'fixed')
                Object.assign(out, transform(m, { x: c.x, y: c.y }));
            if (['scalarLength', 'scalarRadius', 'scalarDistance'].includes(c.type))
                out.measureScale = (c.measureScale ?? 1) * scale;
            this.constraints.set(out.id, out);
        }
        this.entities.delete(id);
        for (const c of [...this.constraints.values()])
            if (c.refs.includes(id))
                this.constraints.delete(c.id);
        return created;
    }
}
