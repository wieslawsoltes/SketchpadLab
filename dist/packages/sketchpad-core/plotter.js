import { displaySegments } from './geometry.js';
/** Modern pen-plot planning over original-to-this-project geometry. HP-GL output
 * is explicitly NOT a reconstructed TX-2/CalComp paper-tape encoding.
 */
export function planPlot(document, { tolerance = 1e-6, order = 'nearest', maxSegments = 100000 } = {}) {
    if (!(tolerance > 0 && Number.isFinite(tolerance)) || !['nearest', 'source', 'worst'].includes(order))
        throw new RangeError('Invalid plot options');
    const input = displaySegments(document);
    if (input.length > maxSegments)
        throw new RangeError('Plot exceeds segment limit');
    const key = p => `${Math.round(p.x / tolerance)},${Math.round(p.y / tolerance)}`, neighbors = new Map(), remaining = new Set(input.map((_, i) => i));
    input.forEach((s, i) => { for (const p of [s.a, s.b]) {
        const k = key(p), list = neighbors.get(k) ?? [];
        list.push(i);
        neighbors.set(k, list);
    } });
    const paths = [];
    let cursor = { x: 0, y: 0 }, penUpDistance = 0, penDownDistance = 0;
    while (remaining.size) {
        // A bounded candidate window avoids quadratic behavior on very large drawings.
        let best = null, score = order === 'worst' ? -Infinity : Infinity, visited = 0;
        for (const i of remaining) {
            const s = input[i];
            for (const [start, end] of [[s.a, s.b], [s.b, s.a]]) {
                const cost = Math.hypot(start.x - cursor.x, start.y - cursor.y);
                if (best === null || (order === 'worst' ? cost > score : cost < score)) {
                    best = { i, start, end };
                    score = cost;
                }
            }
            if (order === 'source' || ++visited >= 2048)
                break;
        }
        remaining.delete(best.i);
        penUpDistance += Math.hypot(best.start.x - cursor.x, best.start.y - cursor.y);
        const points = [best.start, best.end];
        penDownDistance += Math.hypot(best.end.x - best.start.x, best.end.y - best.start.y);
        let end = best.end;
        while (true) {
            const candidate = (neighbors.get(key(end)) ?? []).find(i => remaining.has(i));
            if (candidate === undefined)
                break;
            remaining.delete(candidate);
            const s = input[candidate], p = key(s.a) === key(end) ? s.b : s.a;
            penDownDistance += Math.hypot(p.x - end.x, p.y - end.y);
            points.push(p);
            end = p;
        }
        paths.push(points);
        cursor = end;
    }
    return { paths, penUpDistance, penDownDistance, segments: input.length, order };
}
export function exportHPGL(document, { unitsPerUnit = 40, order = 'nearest' } = {}) {
    if (!Number.isFinite(unitsPerUnit) || unitsPerUnit <= 0 || unitsPerUnit > 1e6)
        throw new RangeError('Invalid plot scale');
    const plan = planPlot(document, { order }), coordinate = p => { const x = Math.round(p.x * unitsPerUnit), y = -Math.round(p.y * unitsPerUnit); if (Math.max(Math.abs(x), Math.abs(y)) > 2147483647)
        throw new RangeError('Plot coordinate overflow'); return `${x},${y}`; };
    return ['IN;SP1;', ...plan.paths.map(points => `PU${coordinate(points[0])};PD${points.slice(1).map(coordinate).join(',')};`), 'PU;SP0;'].join('\n');
}
