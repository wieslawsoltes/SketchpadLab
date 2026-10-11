import { strokeText } from './stroke-font.js';
import { IDENTITY, multiply, transform, pointReferences } from './model.js';
export function flatten(doc, picture = doc.currentPicture, { matrix = IDENTITY, depth = 0, root = null, byPicture = null } = {}) {
    if (depth > 32)
        throw new Error('Instance depth exceeds 32');
    const segments = [], labels = [], handles = [], seenHandles = new Set();
    if (!byPicture) {
        byPicture = new Map();
        for (const entity of doc.entities.values()) {
            const items = byPicture.get(entity.picture) ?? [];
            items.push(entity);
            byPicture.set(entity.picture, items);
        }
    }
    for (const e of byPicture.get(picture) ?? []) {
        const id = root ?? e.id, p = i => transform(matrix, doc.points.get(i));
        if (e.type === 'instance') {
            const out = flatten(doc, e.master, { matrix: multiply(matrix, e.matrix), depth: depth + 1, root: id, byPicture });
            for (const segment of out.segments)
                segments.push(segment);
            for (const label of out.labels)
                labels.push(label);
            continue;
        }
        const line = (a, b) => segments.push({ a, b, id, type: e.type });
        if (e.type === 'line')
            line(p(e.a), p(e.b));
        else if (e.type === 'circle' || e.type === 'arc') {
            const center = doc.points.get(e.center), start = doc.points.get(e.edge ?? e.start), r = Math.hypot(start.x - center.x, start.y - center.y);
            let a = Math.atan2(start.y - center.y, start.x - center.x), span = Math.PI * 2;
            if (e.type === 'arc') {
                const end = doc.points.get(e.end), b = Math.atan2(end.y - center.y, end.x - center.x);
                span = (b - a + Math.PI * 2) % (Math.PI * 2);
                if (!e.ccw)
                    span -= Math.PI * 2;
            }
            const n = Math.max(8, Math.min(512, Math.ceil(Math.abs(span) * Math.max(12, Math.sqrt(r) * 3))));
            let prev = transform(matrix, start);
            for (let j = 1; j <= n; j++) {
                const t = a + span * j / n, now = transform(matrix, { x: center.x + r * Math.cos(t), y: center.y + r * Math.sin(t) });
                line(prev, now);
                prev = now;
            }
        }
        else if (e.type === 'text' || e.type === 'number') {
            const text = e.type === 'number' ? formatNumber(doc.scalars.get(e.scalar).value, e) : e.text;
            const pos = doc.points.get(e.position), angle = e.angle ?? 0, c = Math.cos(angle), s = Math.sin(angle), textMatrix = multiply(matrix, [c, s, -s, c, pos.x, pos.y]);
            labels.push({ id, p: p(e.position), text, size: e.size * Math.hypot(matrix[0], matrix[1]), matrix: textMatrix, sourceSize: e.size });
        }
        if (depth === 0)
            for (const key of pointReferences(e)) {
                const pt = doc.points.get(key);
                if (!seenHandles.has(key)) {
                    handles.push({ ...pt });
                    seenHandles.add(key);
                }
            }
    }
    if (depth === 0)
        for (const c of doc.constraints.values())
            if (c.picture === picture && c.type === 'instancePoint' && !seenHandles.has(c.refs[1])) {
                const pt = doc.points.get(c.refs[1]);
                if (pt) {
                    handles.push({ ...pt, tie: true, instance: c.refs[0] });
                    seenHandles.add(pt.id);
                }
            }
    return { segments, labels, handles };
}
export function distanceToSegment(p, a, b) { const x = b.x - a.x, y = b.y - a.y, d = x * x + y * y, t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / d)) : 0; return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y); }
export function hitTest(doc, p, radius = 8, { includePoints = true } = {}) {
    const flat = flatten(doc);
    if (includePoints) {
        let best = null;
        for (const h of flat.handles) {
            const d = Math.hypot(h.x - p.x, h.y - p.y);
            if (d < radius && (!best || d < best.distance))
                best = { kind: 'point', id: h.id, distance: d };
        }
        if (best)
            return best;
    }
    let best = null;
    for (const s of flat.segments) {
        const d = distanceToSegment(p, s.a, s.b);
        if (d < radius && (!best || d < best.distance))
            best = { kind: 'entity', id: s.id, distance: d };
    }
    for (const l of flat.labels) {
        const d = Math.hypot(p.x - l.p.x, p.y - l.p.y);
        if (d < radius * 2)
            best = { kind: 'entity', id: l.id, distance: d };
    }
    return best;
}
export function bounds(doc) {
    const p = displaySegments(doc).flatMap(s => [s.a, s.b]);
    if (!p.length)
        return { x: -300, y: -300, width: 600, height: 600 };
    let x = Infinity, y = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of p) {
        x = Math.min(x, a.x);
        y = Math.min(y, a.y);
        maxX = Math.max(maxX, a.x);
        maxY = Math.max(maxY, a.y);
    }
    return { x, y, width: Math.max(1, maxX - x), height: Math.max(1, maxY - y) };
}
const xml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export function exportSVG(doc) {
    const b = bounds(doc), pad = 24, segments = displaySegments(doc);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x - pad} ${b.y - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}"><title>Sketchpad drawing</title><g fill="none" stroke="black" stroke-width="1" stroke-linecap="round">${segments.map(s => `<path d="M${s.a.x},${s.a.y}L${s.b.x},${s.b.y}"/>`).join('')}</g></svg>`;
}
export function formatNumber(value, { digits = 5, decimals = 0 } = {}) { if (!Number.isFinite(value))
    return '?'.repeat(digits); const text = value.toFixed(decimals); return text.length > digits ? '*'.repeat(digits) : text.padStart(digits, ' '); }
export function displaySegments(doc, options = {}) { const f = flatten(doc, doc.currentPicture, options); return [...f.segments, ...f.labels.flatMap(l => strokeText(l.text, { matrix: l.matrix, size: l.sourceSize, id: l.id }))]; }
