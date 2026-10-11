import { SketchDocument } from '../packages/sketchpad-core/index.js';
/** Reconstructed drawing, not a recovered Sketchpad memory image. */
export function createDemonstration() {
    const d = new SketchDocument(), main = d.currentPicture;
    d.pictures.get(main).name = 'PICTURE 1 — HEXAGON LATTICE';
    d.pictures.get(main).number = 1;
    const master = d.picture('PICTURE 2 — HEXAGON');
    d.pictures.get(master).number = 2;
    d.currentPicture = master;
    const p = Array.from({ length: 6 }, (_, i) => d.point(30 * Math.cos(i * Math.PI / 3), 30 * Math.sin(i * Math.PI / 3)));
    for (let i = 0; i < 6; i++)
        d.line(p[i], p[(i + 1) % 6]);
    d.points.get(p[0]).tie = true;
    d.points.get(p[3]).tie = true;
    d.currentPicture = main;
    for (let row = 0; row < 5; row++)
        for (let col = 0; col < 5; col++)
            d.instance(master, (col - 2) * 45, (row - 2) * Math.sqrt(3) * 30 + (col % 2) * Math.sqrt(3) * 15);
    const bridge = d.picture('PICTURE 3 — TRUSS');
    d.pictures.get(bridge).number = 3;
    d.currentPicture = bridge;
    const lower = Array.from({ length: 9 }, (_, i) => d.point((i - 4) * 50, 60, { fixed: i === 0 || i === 8 })), upper = Array.from({ length: 8 }, (_, i) => d.point((i - 3.5) * 50, -40));
    for (let i = 0; i < 8; i++) {
        d.line(lower[i], lower[i + 1]);
        d.line(lower[i], upper[i]);
        d.line(upper[i], lower[i + 1]);
        if (i < 7)
            d.line(upper[i], upper[i + 1]);
    }
    for (const e of [...d.entities.values()].filter(e => e.picture === bridge && e.type === 'line')) {
        const a = d.points.get(e.a), b = d.points.get(e.b);
        d.constraint('distance', [e.id], { value: Math.hypot(a.x - b.x, a.y - b.y) });
    }
    const linkage = d.picture('PICTURE 4 — LINKAGE');
    d.pictures.get(linkage).number = 4;
    d.currentPicture = linkage;
    const a = d.point(-130, 80, { fixed: true }), b = d.point(-80, -50), c = d.point(85, -70), e = d.point(130, 80, { fixed: true });
    for (const [p, q] of [[a, b], [b, c], [c, e], [e, a]]) {
        const id = d.line(p, q), x = d.points.get(p), y = d.points.get(q);
        d.constraint('distance', [id], { value: Math.hypot(x.x - y.x, x.y - y.y) });
    }
    d.currentPicture = main;
    d.solve();
    d.validate();
    d.rebuildRings();
    return d;
}
