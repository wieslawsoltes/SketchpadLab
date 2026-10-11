import { pointReferences, transform } from './model.js';
import { hitTest } from './geometry.js';
/** Stateful pen/button interaction independent of DOM and renderer. Original
 * manuscript execution is a separate machine; this is a host reconstruction.
 * Live gestures are one reversible document transaction, not one edit per frame.
 */
export class SketchpadController {
    constructor(document, { radius = () => 8, onChange = () => { }, onSelection = () => { }, onRequest = () => { }, onStatus = () => { } } = {}) {
        this.document = document;
        this.radius = radius;
        this.onChange = onChange;
        this.onSelection = onSelection;
        this.onRequest = onRequest;
        this.onStatus = onStatus;
        this.pen = { x: 0, y: 0, tracking: false };
        this.center = null;
        this.motion = null;
        this.meta = false;
        this.hold = false;
        this.selected = [];
        this.designated = [];
        this.toggles = new Map();
        this.plotOrder = 'nearest';
    }
    setDocument(document) { this.cancel(); this.document = document; this.center = null; this.selected = []; this.designated = []; }
    setPen(x, y, tracking = true) { if (![x, y].every(Number.isFinite))
        throw new RangeError('Invalid light pen position'); this.pen = { x, y, tracking }; if (tracking && this.motion)
        this.move(); this.onChange(); }
    aim({ points = true } = {}) { return hitTest(this.document, this.pen, this.radius(), { includePoints: points }); }
    select(ids) { this.selected = [...new Set(ids)]; this.onSelection(this.selected); }
    aimedOrSelected({ points = true } = {}) { const h = this.aim({ points }); return h ? [h.id] : this.selected; }
    nearestPoint(p = this.pen, except = null) { let found = null, d = this.radius(); for (const q of this.document.points.values())
        if (q.picture === this.document.currentPicture && q.id !== except) {
            const v = Math.hypot(q.x - p.x, q.y - p.y);
            if (v < d) {
                d = v;
                found = q;
            }
        } return found; }
    anchor(p = this.pen) { return this.nearestPoint(p)?.id ?? this.document.point(p.x, p.y); }
    begin(label) { this.stop({ clearCenter: false }); this.document.beginEdit(label); }
    commit(label, fn) { this.stop({ clearCenter: false }); const result = this.document.transaction(label, fn); this.onChange(); return result; }
    startDraw() {
        const doc = this.document, start = { ...this.pen };
        this.begin(this.center ? 'Draw circle arc' : 'Draw line');
        try {
            const a = this.anchor(start), b = doc.point(start.x, start.y);
            let id, c;
            if (this.center) {
                c = this.anchor(this.center);
                if (Math.hypot(this.center.x - start.x, this.center.y - start.y) < 1e-8)
                    throw new Error('Move the pen away from the circle center before DRAW');
                id = doc.arc(c, a, b);
            }
            else
                id = doc.line(a, b);
            this.motion = { kind: this.center ? 'arc' : 'line', id, point: b, start, center: c, anchor: a };
            this.select([id]);
            this.onChange();
            return id;
        }
        catch (error) {
            doc.cancelEdit();
            throw error;
        }
    }
    startMove(ids = this.aimedOrSelected()) {
        const doc = this.document;
        if (!ids.length)
            throw new Error('Aim at an object to move');
        this.begin('Move with light pen');
        const points = new Map(), instances = new Map();
        for (const id of ids) {
            const e = doc.entities.get(id);
            if (doc.points.has(id))
                points.set(id, { ...doc.points.get(id) });
            else if (e?.type === 'instance')
                instances.set(id, [...e.matrix]);
            else if (e)
                for (const p of pointReferences(e))
                    points.set(p, { ...doc.points.get(p) });
        }
        for (const id of points.keys())
            doc.points.get(id).fixed = false;
        this.motion = { kind: 'move', start: { ...this.pen }, points, instances };
        this.select(ids);
        this.onChange();
    }
    startInstance(master) { const doc = this.document; this.begin('Insert moving instance'); try {
        const id = doc.instance(master, this.pen.x, this.pen.y);
        this.motion = { kind: 'move', start: { ...this.pen }, points: new Map(), instances: new Map([[id, [...doc.entities.get(id).matrix]]]) };
        this.select([id]);
        this.onChange();
        return id;
    }
    catch (e) {
        doc.cancelEdit();
        throw e;
    } }
    startText(numeric = false) { const doc = this.document; this.begin(numeric ? 'Create moving number' : 'Create moving text'); const p = doc.point(this.pen.x, this.pen.y), id = numeric ? doc.number(p) : doc.text(p, 'X'); this.motion = { kind: 'text', id, point: p, start: { ...this.pen }, initial: true }; this.select([id]); this.onChange(); return id; }
    type(text) {
        if (this.motion?.kind !== 'text')
            return false;
        const doc = this.document, e = doc.entities.get(this.motion.id);
        if (e.type === 'number') {
            const scalar = doc.scalars.get(e.scalar);
            const current = this.motion.input ?? '';
            this.motion.input = text === 'Backspace' ? current.slice(0, -1) : current + text;
            const value = Number(this.motion.input);
            if (Number.isFinite(value))
                scalar.value = value;
        }
        else {
            e.text = text === 'Backspace' ? e.text.slice(0, -1) : (this.motion.initial ? '' : e.text) + text;
            this.motion.initial = false;
        }
        this.onChange();
        return true;
    }
    move() {
        const m = this.motion, doc = this.document;
        if (!m)
            return;
        const pins = new Map(), instancePins = new Map();
        if (m.kind === 'line' || m.kind === 'arc' || m.kind === 'text') {
            let p = { x: this.pen.x, y: this.pen.y };
            if (m.kind === 'arc') {
                const c = doc.points.get(m.center), a = doc.points.get(m.anchor), r = Math.hypot(a.x - c.x, a.y - c.y), angle = Math.atan2(p.y - c.y, p.x - c.x);
                p = { x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) };
            }
            pins.set(m.point, p);
            if (m.anchor)
                pins.set(m.anchor, doc.points.get(m.anchor));
            if (m.center)
                pins.set(m.center, doc.points.get(m.center));
        }
        else {
            const dx = this.pen.x - m.start.x, dy = this.pen.y - m.start.y;
            for (const [id, p] of m.points)
                pins.set(id, { x: p.x + dx, y: p.y + dy });
            for (const [id, matrix] of m.instances) {
                const next = [...matrix.slice(0, 4), matrix[4] + dx, matrix[5] + dy];
                doc.entities.get(id).matrix = next;
                instancePins.set(id, next);
            }
        }
        doc.solve({ pins, instancePins, maxIterations: 12 });
        this.onChange();
    }
    stop({ clearCenter = true } = {}) {
        const doc = this.document, m = this.motion;
        if (m) {
            try {
                if (m.point && m.kind !== 'text') {
                    const target = this.nearestPoint(doc.points.get(m.point), m.point);
                    if (target && target.id !== m.anchor)
                        doc.mergePoints(m.point, target.id);
                }
                doc.validate();
                doc.endEdit();
            }
            catch (e) {
                doc.cancelEdit();
                this.motion = null;
                throw e;
            }
            this.motion = null;
            this.onChange();
        }
        if (clearCenter)
            this.center = null;
        return !!m;
    }
    cancel() { if (this.motion) {
        this.document.cancelEdit();
        this.motion = null;
        this.onChange();
    } }
    flick() { if (this.hold) {
        this.hold = false;
        this.onStatus('HOLD consumed: movement retained');
        return;
    } this.stop(); this.pen.tracking = false; }
    pictureNumber(number) { return [...this.document.pictures.values()].find(p => p.number === number)?.id ?? [...this.document.pictures.keys()][number - 1]; }
    masterFrom(register = 0o25) { const number = Number((this.toggles.get(register) ?? 1n) & 262143n), id = this.pictureNumber(number); if (!id)
        throw new Error(`No picture numbered ${number.toString(8)}`); return id; }
    dispatch(action) {
        const doc = this.document;
        this.onStatus(action.toUpperCase());
        switch (action) {
            case 'draw': return this.startDraw();
            case 'center':
                this.stop();
                this.center = { x: this.pen.x, y: this.pen.y };
                this.onStatus('CIRCLE CENTER SET — move to start, then DRAW');
                break;
            case 'stop':
                this.stop();
                break;
            case 'move':
                this.startMove();
                break;
            case 'hold':
                this.hold = !this.hold;
                break;
            case 'flick':
                this.flick();
                break;
            case 'meta':
                this.meta = !this.meta;
                break;
            case 'text':
                if (this.meta)
                    this.onRequest('save');
                else
                    this.startText();
                break;
            case 'number':
                this.startText(true);
                break;
            case 'instance': return this.startInstance(this.masterFrom());
            case 'delete': {
                const ids = this.aimedOrSelected();
                if (!ids.length)
                    throw new Error('Aim at an object to delete');
                this.commit('Delete aimed objects', () => doc.remove(ids));
                this.select([]);
                break;
            }
            case 'deleteConstraints':
            case 'deleteFree':
            case 'deletePicture': {
                if (!this.meta)
                    throw new Error('Hold META before this destructive operation');
                this.commit(action, () => {
                    if (action === 'deleteConstraints')
                        for (const c of doc.constraints.values()) {
                            if (c.picture === doc.currentPicture)
                                doc.constraints.delete(c.id);
                        }
                    if (action === 'deleteFree')
                        doc.garbageCollect();
                    if (action === 'deletePicture')
                        doc.remove([...doc.entities.values(), ...doc.points.values(), ...doc.scalars.values()].filter(e => e.picture === doc.currentPicture).map(e => e.id));
                });
                this.select([]);
                break;
            }
            case 'fix':
            case 'tie': {
                const ids = this.aimedOrSelected();
                if (!ids.length)
                    throw new Error('Aim at a point or object');
                this.commit(action, () => { for (const id of ids) {
                    const e = doc.entities.get(id);
                    if (e?.type === 'instance' && action === 'fix')
                        e.fixed = true;
                    for (const p of doc.points.has(id) ? [id] : e ? pointReferences(e) : [])
                        doc.points.get(p)[action === 'tie' ? 'tie' : 'fixed'] = true;
                } });
                break;
            }
            case 'unfix':
                this.commit('Unfix and undesignate', () => { for (const e of [...doc.points.values(), ...doc.entities.values()])
                    if (e.picture === doc.currentPicture)
                        e.fixed = false; });
                this.designated = [];
                break;
            case 'designate': {
                const ids = this.aimedOrSelected();
                if (!ids.length)
                    throw new Error('Aim at an object to designate');
                this.designated = [...new Set([...this.designated, ...ids])];
                this.select(this.designated);
                break;
            }
            case 'horv': {
                const id = this.aimedOrSelected({ points: false }).find(id => doc.entities.get(id)?.type === 'line');
                if (!id)
                    throw new Error('Aim at a line for HORV');
                const e = doc.entities.get(id), a = doc.points.get(e.a), b = doc.points.get(e.b);
                this.commit('Horizontal or vertical', () => doc.constraint(Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'horizontal' : 'vertical', [id]));
                this.select([id]);
                break;
            }
            case 'constraint':
                this.onRequest('constraint');
                break;
            case 'change': {
                const id = this.aimedOrSelected({ points: false }).find(id => doc.entities.get(id)?.type === 'instance');
                if (!id)
                    throw new Error('Aim at an instance');
                this.commit('Change instance definition', () => doc.changeInstance(id, this.masterFrom()));
                break;
            }
            case 'copy20':
            case 'copy21':
            case 'copy22':
            case 'copy23': {
                const register = parseInt(action.slice(4), 8);
                const targets = this.designated.filter(id => doc.points.has(id));
                const created = this.commit('Copy definition and constraints', () => doc.copyDefinition(this.masterFrom(register), { ...this.pen, targets }));
                this.select(created);
                this.designated = [];
                break;
            }
            case 'dismember': {
                const id = this.aimedOrSelected({ points: false }).find(id => doc.entities.get(id)?.type === 'instance');
                if (!id)
                    throw new Error('Aim at a picture instance');
                this.select(this.commit('Dismember with constraints', () => doc.explode(id)));
                break;
            }
            case 'garbage':
                if (this.pen.tracking)
                    this.onRequest('recenter', this.pen);
                else
                    this.commit('Collect garbage', () => doc.garbageCollect());
                break;
            case 'order':
                this.plotOrder = 'nearest';
                this.onRequest('plan', this.plotOrder);
                break;
            case 'disorder':
                this.plotOrder = 'worst';
                this.onRequest('plan', this.plotOrder);
                break;
            case 'punch':
                this.onRequest('hpgl', this.plotOrder);
                break;
            case 'plot':
                this.onRequest('svg');
                break;
            case 'library':
                this.onRequest('library');
                break;
            default: throw new Error(`Unassigned console action ${action}`);
        }
        this.onChange();
    }
}
