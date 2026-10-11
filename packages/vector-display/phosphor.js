/** Bounded deterministic 1024-address spot display with exponential afterglow.
 * This samples a host display list. It is NOT the TX-2 display-generation program.
 */
export class Phosphor {
    constructor({ resolution = 1024, persistence = 600, maxSpots = 100000 } = {}) { if (!Number.isInteger(resolution) || resolution < 2 || resolution > 4096)
        throw new RangeError('Invalid resolution'); this.resolution = resolution; this.persistence = persistence; this.maxSpots = maxSpots; this.spots = new Map(); this.time = 0; this.lastFrame = []; }
    clear() { this.spots.clear(); this.lastFrame = []; }
    frame(lines, { width, height, time = 0, spots = true } = {}) {
        if (!(width > 0 && height > 0 && Number.isFinite(time)))
            return [];
        const n = this.resolution - 1, active = new Map(), bounds = n;
        // Clip BEFORE sampling: an off-screen entity cannot generate unbounded work.
        const emit = (x, y, alpha) => { if (x < 0 || y < 0 || x > bounds || y > bounds || active.size >= this.maxSpots)
            return; const key = y * this.resolution + x; const prior = active.get(key); active.set(key, { x, y, alpha: Math.max(prior?.alpha ?? 0, alpha), time }); };
        for (const line of lines) {
            const clip = clipLine(line.a.x / width * n, line.a.y / height * n, line.b.x / width * n, line.b.y / height * n, n);
            if (!clip)
                continue;
            let [x, y, tx, ty] = clip.map(Math.round);
            const dx = Math.abs(tx - x), sx = x < tx ? 1 : -1, dy = -Math.abs(ty - y), sy = y < ty ? 1 : -1;
            let error = dx + dy;
            for (let step = 0; step <= 2 * this.resolution; step++) {
                emit(x, y, line.alpha ?? .9);
                if (x === tx && y === ty)
                    break;
                const twice = 2 * error;
                if (twice >= dy) {
                    error += dy;
                    x += sx;
                }
                if (twice <= dx) {
                    error += dx;
                    y += sy;
                }
            }
        }
        if (time < this.time)
            this.clear();
        this.time = time;
        for (const [key, point] of this.spots) {
            if (active.has(key) || active.size >= this.maxSpots)
                continue;
            const alpha = this.persistence > 0 ? point.alpha * Math.exp(-(time - point.time) / this.persistence) : 0;
            if (alpha > .015)
                active.set(key, { ...point, alpha, time });
        }
        // Old spots are evicted first by Map insertion order; current illumination wins.
        this.spots = active;
        this.lastFrame = Array.from(active.values(), p => ({ a: { x: p.x / n * width, y: p.y / n * height }, b: { x: p.x / n * width, y: p.y / n * height }, alpha: p.alpha }));
        return this.lastFrame;
    }
}
export function clipLine(x0, y0, x1, y1, n) {
    if (![x0, y0, x1, y1, n].every(Number.isFinite))
        return null;
    let lo = 0, hi = 1;
    const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0], [dx, n - x0], [-dy, y0], [dy, n - y0]]) {
        if (p === 0) {
            if (q < 0)
                return null;
            continue;
        }
        const r = q / p;
        if (p < 0)
            lo = Math.max(lo, r);
        else
            hi = Math.min(hi, r);
        if (lo > hi)
            return null;
    }
    return [x0 + lo * dx, y0 + lo * dy, x0 + hi * dx, y0 + hi * dy];
}
