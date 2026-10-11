import { HistoricalConsole } from './historical-console.js';
import { SketchDocument, flatten, bounds, hitTest, pointReferences, exportSVG, exportHPGL, planPlot, strokeText, SketchpadController, multiply, transform } from '../../packages/sketchpad-core/index.js';
import { VectorDisplay } from '../../packages/vector-display/index.js';
import { createDemonstration } from '../../examples/drawings.js';
import { PROGRAMS } from '../../examples/programs.js';
import { ORIGINALS, fetchOriginal, gitBlobHash, verifyOriginal, auditListing } from '../../packages/tx2-assembler/provenance.js';
const $ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let historical = null, penController = null, lastDrawTime = 0;
let doc = createDemonstration(), tool = 'select', pending = [], cursor = { x: 0, y: 0 }, selection = new Set(), showPoints = false, showGrid = false, holdPen = false, meta = false, space = false, drag = null, dirty = true, sourceFilename = 'diagnostic.tx2', cpuState = null, archive = null, toastTimer, unsubscribe = null;
const overlay = $('overlay'), overlayContext = overlay.getContext('2d'), display = new VectorDisplay($('vector-canvas'), { onBackend: name => { $('backend').textContent = name + ' VECTOR DISPLAY'; dirty = true; }, onError: message => console.info('[Vector renderer]', message) });
await display.initialize({ forceCanvas: new URLSearchParams(location.search).has('canvas') });
const camera = display.camera;
function notify(message, { toast = true } = {}) {
    $('status-message').textContent = message;
    if (toast) {
        $('toast').textContent = message;
        $('toast').classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3400);
    }
}
function safe(fn) {
    return (...args) => {
        try {
            const result = fn(...args);
            if (result?.catch)
                result.catch(e => notify(e.message));
        }
        catch (e) {
            notify(e.message);
            console.error(e);
        }
    };
}
function button(id, fn) { $(id).addEventListener('click', safe(fn)); }
function download(name, data, type = 'application/json') { const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
function chooseFile(accept, callback) {
    const input = $('file-input');
    input.accept = accept;
    input.value = '';
    input.onchange = safe(async () => {
        if (input.files[0])
            await callback(input.files[0]);
    });
    input.click();
}
function activateView(view) {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    for (const id of ['console-view', 'workbench-view', 'archive-view'])
        $(id).classList.remove('active');
    $(view === 'console' ? 'console-view' : view === 'archive' ? 'archive-view' : 'workbench-view').classList.add('active');
    $('workbench-view').classList.toggle('debug-focus', view === 'debugger');
    location.hash = view;
    dirty = true;
    if (view === 'debugger')
        worker.postMessage({ type: 'state' });
}
document.querySelectorAll('.nav-tab').forEach(b => b.addEventListener('click', () => activateView(b.dataset.view)));
function attachDocument() {
    unsubscribe?.();
    unsubscribe = doc.onChange(({ label }) => {
        refreshPanels();
        dirty = true;
        try {
            localStorage.setItem('sketchpad-lab.autosave', doc.serialize());
        }
        catch { }
        notify(label, { toast: false });
    });
    refreshPanels();
    dirty = true;
}
function replaceDocument(next) { penController?.setDocument(next); doc = next; selection.clear(); pending = []; attachDocument(); fit(); }
function edit(label, fn, options) { penController?.stop(); const r = doc.transaction(label, fn, options); selection = new Set([...selection].filter(id => doc.entities.has(id) || doc.points.has(id))); refreshPanels(); dirty = true; return r; }
function currentEntities() { return [...doc.entities.values()].filter(e => e.picture === doc.currentPicture); }
function selectedEntities() { return [...selection].map(id => doc.entities.get(id)).filter(Boolean); }
function selectedPoints() {
    const ids = new Set([...selection].filter(id => doc.points.has(id)));
    for (const e of selectedEntities())
        pointReferences(e).forEach(id => ids.add(id));
    return [...ids].map(id => doc.points.get(id));
}
function setTool(next) { penController?.stop(); pending = []; tool = next; document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === next)); const descriptions = { select: 'Drag points · Shift-select objects', move: 'Drag geometry · Shared points stay connected', line: 'Pick start, then endpoint', circle: 'Pick center, then radius', arc: 'Pick center, start, then endpoint', text: 'Click to place text', instance: 'Click to place a live picture instance' }; $('tool-indicator').textContent = next.toUpperCase(); $('tool-detail').textContent = descriptions[next]; dirty = true; }
function fit() { camera.fit(bounds(doc), 22); syncCamera(); dirty = true; }
function syncCamera() { $('zoom-readout').textContent = camera.zoom.toFixed(2) + '×'; $('zoom-slider').value = String(Math.log2(camera.zoom) * 10); $('zoom-knob').style.setProperty('--angle', `${Math.log2(camera.zoom) * 60}deg`); }
function pointAt(event) { const r = overlay.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
function snapped(p) {
    let closest = null, distance = 9 / camera.zoom;
    for (const q of doc.points.values())
        if (q.picture === doc.currentPicture) {
            const d = Math.hypot(p.x - q.x, p.y - q.y);
            if (d < distance) {
                closest = q;
                distance = d;
            }
        }
    if (closest)
        return { ...closest };
    return showGrid ? { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 } : p;
}
function realize(p) { return p.id && doc.points.has(p.id) ? p.id : doc.point(p.x, p.y); }
function finishDrawing() {
    const needed = tool === 'arc' ? 3 : 2;
    if (pending.length < needed)
        return;
    let id;
    edit(`Draw ${tool}`, () => {
        const ids = pending.map(realize);
        if (tool === 'line') {
            if (ids[0] === ids[1])
                throw new Error('Line endpoints must differ');
            id = doc.line(...ids);
        }
        if (tool === 'circle') {
            if (ids[0] === ids[1])
                throw new Error('Circle radius must be nonzero');
            id = doc.circle(...ids);
        }
        if (tool === 'arc')
            id = doc.arc(...ids);
    });
    selection = new Set([id]);
    const last = pending.at(-1);
    pending = holdPen && tool === 'line' ? [{ ...last, id: doc.entities.get(id).b }] : [];
    refreshPanels();
    dirty = true;
}
function beginDrag(event, p, hit) { const objects = selectedEntities(), points = selectedPoints(); drag = { start: p, last: p, screen: pointAt(event), started: false, point: hit?.kind === 'point' ? hit.id : null, initialPoints: new Map(points.map(q => [q.id, { x: q.x, y: q.y, fixed: q.fixed }])), initialMatrices: new Map(objects.filter(e => e.type === 'instance').map(e => [e.id, [...e.matrix]])) }; }
overlay.addEventListener('pointerdown', safe(event => {
    event.preventDefault();
    overlay.focus();
    overlay.setPointerCapture(event.pointerId);
    const screen = pointAt(event), p = camera.screenToWorld(screen);
    cursor = p;
    if (penController?.motion) {
        penController.stop();
        dirty = true;
        return;
    }
    if (event.button === 1 || event.button === 2 || space) {
        drag = { pan: true, start: screen, camera: { x: camera.x, y: camera.y } };
        return;
    }
    if (['line', 'circle', 'arc'].includes(tool)) {
        pending.push(snapped(p));
        finishDrawing();
        dirty = true;
        return;
    }
    if (tool === 'text') {
        const text = prompt('Text to draw', 'SKETCHPAD');
        if (text) {
            let id;
            edit('Create text', () => { id = doc.text(realize(snapped(p)), text, 18); });
            selection = new Set([id]);
        }
        setTool('select');
        return;
    }
    if (tool === 'instance') {
        const master = Number($('master-select').value);
        edit('Insert live picture', () => { const id = doc.instance(master, p.x, p.y); selection = new Set([id]); });
        if (!holdPen)
            setTool('select');
        return;
    }
    const hit = hitTest(doc, p, 9 / camera.zoom, { includePoints: tool !== 'move' });
    if (!hit) {
        if (!event.shiftKey)
            selection.clear();
        refreshPanels();
        dirty = true;
        return;
    }
    if (event.shiftKey) {
        if (selection.has(hit.id))
            selection.delete(hit.id);
        else
            selection.add(hit.id);
        refreshPanels();
        dirty = true;
        return;
    }
    if (!selection.has(hit.id))
        selection = new Set([hit.id]);
    if (hit.kind === 'point' || tool === 'move' || doc.entities.get(hit.id)?.type === 'instance')
        beginDrag(event, p, hit);
    refreshPanels();
    dirty = true;
}));
overlay.addEventListener('pointermove', safe(event => {
    const screen = pointAt(event), p = camera.screenToWorld(screen);
    cursor = p;
    penController?.setPen(p.x, p.y, true);
    historical?.updatePen(screen.x / camera.width * 1023, screen.y / camera.height * 1023, true);
    if (penController?.motion) {
        dirty = true;
        return;
    }
    $('coord-x').textContent = (p.x >= 0 ? '+' : '') + p.x.toFixed(2);
    $('coord-y').textContent = (p.y >= 0 ? '+' : '') + p.y.toFixed(2);
    if (drag?.pan) {
        camera.x = drag.camera.x - (screen.x - drag.start.x) / camera.zoom;
        camera.y = drag.camera.y - (screen.y - drag.start.y) / camera.zoom;
        dirty = true;
        return;
    }
    if (drag) {
        if (!drag.started && Math.hypot(screen.x - drag.screen.x, screen.y - drag.screen.y) > 2) {
            doc.beginEdit('Move geometry');
            drag.started = true;
            for (const id of drag.initialPoints.keys())
                doc.points.get(id).fixed = false;
        }
        if (drag.started) {
            const dx = p.x - drag.start.x, dy = p.y - drag.start.y, pins = new Map();
            for (const [id, q] of drag.initialPoints)
                pins.set(id, { x: q.x + dx, y: q.y + dy });
            for (const [id, m] of drag.initialMatrices) {
                doc.entities.get(id).matrix = [...m.slice(0, 4), m[4] + dx, m[5] + dy];
            }
            doc.solve({ pins, maxIterations: 15 });
            refreshSolver();
            dirty = true;
        }
    }
    if (pending.length)
        dirty = true;
}));
overlay.addEventListener('pointerup', safe(event => {
    if (drag?.started) {
        for (const [id, initial] of drag.initialPoints)
            doc.points.get(id).fixed = initial.fixed;
        doc.endEdit();
        refreshPanels();
    }
    drag = null;
    if (overlay.hasPointerCapture(event.pointerId))
        overlay.releasePointerCapture(event.pointerId);
}));
overlay.addEventListener('pointercancel', () => {
    if (drag?.started)
        doc.cancelEdit();
    drag = null;
    dirty = true;
});
overlay.addEventListener('contextmenu', e => e.preventDefault());
overlay.addEventListener('wheel', e => { e.preventDefault(); camera.zoomAt(Math.exp(-Math.max(-200, Math.min(200, e.deltaY)) * .0015), pointAt(e)); syncCamera(); dirty = true; }, { passive: false });
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
button('stop-btn', () => {
    penController?.stop();
    if (drag?.started)
        doc.cancelEdit();
    drag = null;
    setTool('select');
    notify('Drawing stopped.');
});
button('delete-btn', () => {
    if (meta) {
        edit('Delete constraints', () => {
            for (const c of doc.constraints.values())
                if (c.picture === doc.currentPicture)
                    doc.constraints.delete(c.id);
        });
    }
    else {
        if (!selection.size)
            throw new Error('Select geometry to delete');
        edit('Delete selection', () => doc.remove([...selection]));
        selection.clear();
    }
    refreshPanels();
});
button('fix-btn', () => {
    const points = selectedPoints();
    if (!points.length)
        throw new Error('Select points or geometry to fix');
    edit('Fix geometry', () => points.forEach(p => p.fixed = true));
});
button('unfix-btn', () => edit('Unfix picture', () => {
    for (const p of doc.points.values())
        if (p.picture === doc.currentPicture)
            p.fixed = false;
}));
button('tie-btn', () => {
    const points = selectedPoints();
    if (!points.length)
        throw new Error('Select a point to mark as an attacher');
    edit('Toggle attacher points', () => points.forEach(p => p.tie = !p.tie));
    notify('Attacher points set. New instances create constrained host points automatically.');
});
button('solve-btn', () => { const s = doc.solve({ maxIterations: 100 }); refreshPanels(); dirty = true; notify(s.converged ? 'All active constraints satisfied.' : `Conflicting or unsatisfied constraints: residual ${s.maxResidual.toExponential(2)}`); });
button('garbage-btn', () => edit('Compact unused points', () => doc.garbageCollect()));
button('hold-btn', () => { holdPen = !holdPen; $('hold-btn').classList.toggle('selected', holdPen); $('hold-btn').setAttribute('aria-pressed', holdPen); });
button('meta-btn', () => { meta = !meta; $('meta-btn').classList.toggle('selected', meta); $('meta-btn').setAttribute('aria-pressed', meta); notify(meta ? 'META: Delete clears the current picture’s constraints.' : 'META released.'); });
button('grid-btn', () => { showGrid = !showGrid; $('grid-btn').classList.toggle('selected', showGrid); $('grid-btn').setAttribute('aria-pressed', showGrid); dirty = true; });
button('inspect-btn', () => { showPoints = !showPoints; $('inspect-btn').classList.toggle('selected', showPoints); $('inspect-btn').setAttribute('aria-pressed', showPoints); dirty = true; });
button('fit-btn', fit);
button('undo-btn', () => doc.undo());
button('redo-btn', () => doc.redo());
button('new-btn', () => {
    if (confirm('Start a new drawing? Save the current drawing first to keep it.'))
        replaceDocument(new SketchDocument());
});
button('open-btn', () => chooseFile('.json', async (file) => { const next = new SketchDocument(); next.restore(await file.text()); next.solve(); replaceDocument(next); notify(`Opened ${file.name}`); }));
button('save-btn', () => download('drawing.sketchpad.json', doc.serialize()));
button('svg-btn', () => download('drawing.svg', exportSVG(doc), 'image/svg+xml'));
button('insert-btn', () => {
    if (!$('master-select').value)
        throw new Error('Define another picture first');
    setTool('instance');
});
button('master-btn', () => {
    const ids = selectedEntities().map(e => e.id);
    if (!ids.length)
        throw new Error('Select drawing entities to define a reusable master');
    const name = prompt('Master picture name', 'MASTER');
    if (!name)
        return;
    let master;
    edit('Define picture master', () => { master = doc.createMaster(ids, name); });
    $('master-select').value = master;
    notify('Master created. Insert adds live instances; editing the master updates every instance.');
});
button('explode-btn', () => {
    const e = selectedEntities().find(e => e.type === 'instance');
    if (!e)
        throw new Error('Select a picture instance first');
    edit('Dismember picture instance', () => { selection = new Set(doc.explode(e.id)); });
    notify('Instance dismembered one level with transformed constraints and connected attachers.');
});
$('picture-select').addEventListener('change', safe(() => { doc.currentPicture = Number($('picture-select').value); selection.clear(); pending = []; doc.solve(); refreshPanels(); fit(); }));
$('zoom-slider').addEventListener('input', () => { camera.zoom = 2 ** (Number($('zoom-slider').value) / 10); syncCamera(); dirty = true; });
$('glow-slider').addEventListener('input', () => { display.intensity = Number($('glow-slider').value) / 100; $('glow-knob').style.setProperty('--angle', `${(display.intensity - 1) * 140}deg`); dirty = true; });
$('rotate-slider').addEventListener('change', safe(() => {
    const e = selectedEntities().find(e => e.type === 'instance');
    if (!e)
        throw new Error('Select a picture instance to rotate');
    const angle = Number($('rotate-slider').value) * Math.PI / 180, s = Math.hypot(e.matrix[0], e.matrix[1]);
    edit('Rotate instance', () => { e.matrix = [Math.cos(angle) * s, Math.sin(angle) * s, -Math.sin(angle) * s, Math.cos(angle) * s, e.matrix[4], e.matrix[5]]; });
    $('rotate-knob').style.setProperty('--angle', `${Number($('rotate-slider').value)}deg`);
}));
function addConstraint(type) {
    const lines = selectedEntities().filter(e => e.type === 'line'), points = [...selection].filter(id => doc.points.has(id));
    let refs, extra = {};
    if (['horizontal', 'vertical', 'distance'].includes(type)) {
        if (lines.length !== 1)
            throw new Error('Select exactly one line');
        refs = [lines[0].id];
        if (type === 'distance') {
            const a = doc.points.get(lines[0].a), b = doc.points.get(lines[0].b), answer = prompt('Target length in drawing units', Math.hypot(b.x - a.x, b.y - a.y).toFixed(2));
            if (answer === null)
                return;
            const value = Number(answer);
            if (!Number.isFinite(value) || value <= 0)
                throw new Error('Length must be a positive number');
            extra.value = value;
        }
    }
    else if (type === 'coincident') {
        if (points.length !== 2)
            throw new Error('Shift-select exactly two points');
        refs = points;
    }
    else {
        if (lines.length !== 2)
            throw new Error('Shift-select exactly two lines');
        refs = lines.map(e => e.id);
    }
    edit(`Add ${type} constraint`, () => doc.constraint(type, refs, extra));
    const s = doc.lastSolve;
    if (!s.converged)
        notify('Constraint added, but the system conflicts. Remove a conflicting constraint or unfix geometry.');
}
document.querySelectorAll('[data-constraint]').forEach(b => b.addEventListener('click', safe(() => addConstraint(b.dataset.constraint))));
function refreshSolver() { const s = doc.lastSolve; $('dof').textContent = s?.degreesOfFreedom ?? '—'; $('residual').textContent = s ? s.maxResidual < 1e-8 ? '0.00' : s.maxResidual.toExponential(1) : '—'; $('iterations').textContent = s?.iterations ?? '—'; $('solver-status').textContent = s?.converged ? 'CONSTRAINTS SATISFIED' : 'CONSTRAINT CONFLICT'; $('solver-status').className = s?.converged ? 'solver-good' : 'solver-bad'; }
function refreshPanels() {
    if (historical)
        historical.updatePicture(doc.pictures.get(doc.currentPicture).number ?? ([...doc.pictures.keys()].indexOf(doc.currentPicture) + 1));
    const masterValue = $('master-select').value;
    const options = [...doc.pictures.values()].map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('picture-select').innerHTML = options;
    $('picture-select').value = doc.currentPicture;
    $('master-select').innerHTML = [...doc.pictures.values()].filter(p => p.id !== doc.currentPicture && !doc.reaches(p.id, doc.currentPicture)).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    if ([...$('master-select').options].some(o => o.value === masterValue))
        $('master-select').value = masterValue;
    $('selection-count').textContent = `${selection.size} SELECTED`;
    $('entity-readout').textContent = `${currentEntities().length.toString().padStart(3, '0')} OBJECTS`;
    const list = [...doc.constraints.values()].filter(c => c.picture === doc.currentPicture);
    $('constraint-count').textContent = list.length;
    const glyphs = { horizontal: 'H', vertical: 'V', distance: 'D', radius: 'R', parallel: '∥', perpendicular: '⊥', equalLength: '=', coincident: '⊙', arcRadius: 'C' };
    $('constraint-list').innerHTML = list.slice(0, 500).map(c => { const residual = doc.lastSolve?.residualByConstraint.get(c.id) ?? 0; return `<div class="constraint-row ${residual > 1e-5 ? 'bad' : ''}"><span class="constraint-glyph">${glyphs[c.type] ?? '·'}</span><span class="cname">${esc(c.type)}${c.value !== undefined ? ' ' + c.value.toFixed(1) : ''}</span><span class="cres">${residual < 1e-5 ? 'SATISFIED' : residual.toExponential(1)}</span><button data-remove-constraint="${c.id}" title="Remove constraint">×</button></div>`; }).join('') || '<div class="constraint-row">No constraints in this picture</div>';
    $('constraint-list').querySelectorAll('[data-remove-constraint]').forEach(b => b.addEventListener('click', safe(() => edit('Remove constraint', () => doc.constraints.delete(Number(b.dataset.removeConstraint))))));
    const ids = [...selection], point = ids.length === 1 ? doc.points.get(ids[0]) : null, entity = ids.length === 1 ? doc.entities.get(ids[0]) : null;
    if (point) {
        $('selection-info').innerHTML = `<strong>POINT #${point.id}</strong> · ${point.fixed ? 'FIXED' : 'MOVABLE'}${point.tie ? ' · ATTACHER' : ''}<br><label>X <input id="point-x-input" type="number" step="any" value="${point.x.toFixed(3)}"></label><label>Y <input id="point-y-input" type="number" step="any" value="${point.y.toFixed(3)}"></label>`;
        for (const key of ['x', 'y'])
            $(`point-${key}-input`).addEventListener('change', safe(() => {
                const v = Number($(`point-${key}-input`).value);
                if (!Number.isFinite(v))
                    throw new Error('Coordinate must be finite');
                edit('Edit point coordinate', () => { point[key] = v; doc.solve({ pins: new Map([[point.id, { x: point.x, y: point.y }]]) }); }, { solve: false });
            }));
    }
    else if (entity) {
        let text = `<strong>${entity.type.toUpperCase()} #${entity.id}</strong>`;
        if (entity.type === 'line') {
            const a = doc.points.get(entity.a), b = doc.points.get(entity.b);
            text += ` · length ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(3)} · shared endpoints #${entity.a}, #${entity.b}`;
        }
        if (entity.type === 'instance')
            text += ` · master ${esc(doc.pictures.get(entity.master).name)} · scale ${Math.hypot(entity.matrix[0], entity.matrix[1]).toFixed(3)}`;
        if (entity.type === 'text')
            text += ` · ${esc(entity.text)}`;
        $('selection-info').innerHTML = text;
    }
    else
        $('selection-info').textContent = selection.size ? `${selection.size} objects selected. Choose a compatible constraint or define a master picture.` : 'Select a line or point to inspect its geometry. Shift-click to build a multi-selection.';
    $('undo-btn').disabled = !doc.history.length;
    $('redo-btn').disabled = !doc.future.length;
    refreshSolver();
    drawRings();
    dirty = true;
}
function drawRings() {
    const c = $('ring-canvas'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const point = [...selection].find(id => doc.points.has(id)), anchor = point ? doc.pointRings.get(point) : doc.pictureRings.get(doc.currentPicture), nodes = [anchor, ...doc.rings.nodes(anchor)].slice(0, 25), n = nodes.length;
    const positions = nodes.map((_, i) => ({ x: 300 + 215 * Math.cos(i / n * Math.PI * 2 - Math.PI / 2), y: 130 + 92 * Math.sin(i / n * Math.PI * 2 - Math.PI / 2) }));
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
        const a = positions[i], b = positions[(i + 1) % n];
        ctx.strokeStyle = '#596f44';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    positions.forEach((p, i) => { ctx.fillStyle = i ? '#2c4227' : '#8eab62'; ctx.strokeStyle = '#9eae77'; ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = i ? '#c9dfaa' : '#1a2818'; ctx.fillText(i ? String(doc.rings.value[nodes[i]]) : 'H', p.x, p.y); });
    $('ring-info').textContent = `${point ? 'Point ' + point + ' incidence' : 'Picture ' + doc.currentPicture + ' membership'} ring\nAnchor ${anchor} · ${n - 1} shown nodes · ${doc.rings.count} allocated\nNext / previous links verified: ${doc.rings.validate() ? 'yes' : 'no'}\nModern intrusive ring arena; not original TX-2 memory.`;
}
document.querySelectorAll('[data-inspector]').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('[data-inspector]').forEach(x => x.classList.toggle('active', x === b)); $('constraint-list').hidden = b.dataset.inspector !== 'constraints'; $('topology-panel').hidden = b.dataset.inspector !== 'topology'; drawRings(); }));
function previewSegments() {
    const out = [], p = pending[0];
    if (!p)
        return out;
    const end = snapped(cursor), segment = (a, b) => out.push({ a, b, id: -1 });
    if (tool === 'line')
        segment(p, end);
    if (tool === 'circle' || tool === 'arc') {
        const start = pending[1] ?? end, r = Math.hypot(start.x - p.x, start.y - p.y);
        let a = 0, span = Math.PI * 2;
        if (tool === 'arc' && pending.length >= 2) {
            a = Math.atan2(start.y - p.y, start.x - p.x);
            span = (Math.atan2(end.y - p.y, end.x - p.x) - a + Math.PI * 2) % (Math.PI * 2);
        }
        let prev = { x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) };
        for (let i = 1; i <= 96; i++) {
            const now = { x: p.x + r * Math.cos(a + span * i / 96), y: p.y + r * Math.sin(a + span * i / 96) };
            segment(prev, now);
            prev = now;
        }
        segment(p, start);
    }
    return out;
}
function render() {
    requestAnimationFrame(render);
    const now = performance.now();
    if (now - lastDrawTime < 33)
        return;
    if ((!dirty && !(display.spots && display.phosphor.persistence > 0)) || !$('console-view').classList.contains('active'))
        return;
    dirty = false;
    lastDrawTime = now;
    const flat = flatten(doc), segments = [...flat.segments, ...flat.labels.flatMap(l => strokeText(l.text, { matrix: l.matrix, size: l.sourceSize, id: l.id })), ...previewSegments()];
    display.draw(segments, { selected: selection, grid: showGrid });
    const ctx = overlayContext, dpr = display.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, camera.width, camera.height);
    ctx.shadowBlur = 0;
    if (showPoints)
        for (const p of flat.handles) {
            const s = camera.worldToScreen(p), selected = selection.has(p.id);
            ctx.strokeStyle = selected ? '#ffdda0' : p.fixed ? '#c6ce87' : p.tie ? '#e3c18a' : '#588974';
            ctx.fillStyle = selected ? '#ffdda0' : '#0c2117';
            const radius = selected ? 4 : 2.3;
            ctx.lineWidth = 1;
            if (p.fixed) {
                ctx.strokeRect(s.x - radius - 2, s.y - radius - 2, (radius + 2) * 2, (radius + 2) * 2);
            }
            ctx.beginPath();
            ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            if (p.tie) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    const annotations = new Map();
    for (const c of doc.constraints.values())
        if (showPoints && c.picture === doc.currentPicture && ['horizontal', 'vertical', 'distance'].includes(c.type)) {
            const e = doc.entities.get(c.refs[0]);
            if (e?.type !== 'line')
                continue;
            const list = annotations.get(e.id) ?? [];
            list.push(c.type === 'distance' ? c.value.toFixed(0) : c.type === 'horizontal' ? 'H' : 'V');
            annotations.set(e.id, list);
        }
    for (const [id, labels] of annotations) {
        const e = doc.entities.get(id), a = doc.points.get(e.a), b = doc.points.get(e.b), s = camera.worldToScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        ctx.fillStyle = '#6f9678';
        ctx.font = '9px monospace';
        ctx.fillText(labels.join(' · '), s.x + 7, s.y - 6);
    }
    if (pending.length || penController?.motion) {
        const p = camera.worldToScreen(snapped(cursor));
        ctx.strokeStyle = '#ddd6a6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 6, p.y);
        ctx.lineTo(p.x + 6, p.y);
        ctx.moveTo(p.x, p.y - 6);
        ctx.lineTo(p.x, p.y + 6);
        ctx.stroke();
    }
}
let firstResize = true;
new ResizeObserver(() => {
    const width = overlay.clientWidth, height = overlay.clientHeight;
    if (width && height) {
        display.resize(width, height);
        overlay.width = Math.round(width * display.dpr);
        overlay.height = Math.round(height * display.dpr);
        if (firstResize) {
            fit();
            firstResize = false;
        }
        dirty = true;
    }
}).observe($('stage'));
document.addEventListener('keydown', safe(event => {
    const input = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    if (input || $('help-dialog').open)
        return;
    if (event.code === 'Space') {
        event.preventDefault();
        space = true;
        return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? doc.redo() : doc.undo();
        return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey)
        return;
    const keys = { v: 'select', m: 'move', l: 'line', c: 'circle', a: 'arc', t: 'text' };
    if (keys[event.key.toLowerCase()]) {
        event.preventDefault();
        setTool(keys[event.key.toLowerCase()]);
    }
    if (event.key === 'Escape')
        $('stop-btn').click();
    if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        $('delete-btn').click();
    }
    if (event.key.toLowerCase() === 'f')
        $('fix-btn').click();
}));
document.addEventListener('keyup', event => {
    if (event.code === 'Space')
        space = false;
});
window.addEventListener('blur', () => {
    space = false;
    if (drag?.started)
        doc.cancelEdit();
    drag = null;
});
button('help-btn', () => $('help-dialog').showModal());
button('help-close', () => $('help-dialog').close());
// A classic bootstrap dynamically imports the ESM engine. This also works from a
// self-contained file / opaque-origin preview where module-worker startup may fail.
const workerModule = new URL('./worker.js', import.meta.url).href;
const workerBootstrap = URL.createObjectURL(new Blob([`import(${JSON.stringify(workerModule)}).catch(error=>postMessage({type:'error',message:error.message}));`], { type: 'text/javascript' }));
const worker = new Worker(workerBootstrap);
const send = (type, extra = {}) => worker.postMessage({ type, ...extra });
penController = new SketchpadController(doc, {
    radius: () => 9 / camera.zoom,
    onChange: () => { dirty = true; historical?.latch('hold', penController.hold); historical?.latch('meta', penController.meta); }, onSelection: ids => { selection = new Set(ids); refreshPanels(); },
    onStatus: message => { historical?.log(message); notify(message, { toast: false }); },
    onRequest: (kind, value) => {
        if (kind === 'recenter') {
            camera.x = value.x;
            camera.y = value.y;
            dirty = true;
        }
        else if (kind === 'save')
            $('save-btn').click();
        else if (kind === 'svg')
            download('sketchpad-plot.svg', exportSVG(doc), 'image/svg+xml');
        else if (kind === 'hpgl') {
            download('sketchpad-modern-plot.hpgl', exportHPGL(doc, { order: value }), 'application/vnd.hp-hpgl');
            notify('HP-GL interchange exported; this is not historical TX-2 paper tape.');
        }
        else if (kind === 'plan') {
            const p = planPlot(doc, { order: value });
            historical.log(`${p.paths.length} PEN RUNS / ${p.penUpDistance.toFixed(1)} PEN-UP`);
        }
        else if (kind === 'library')
            $('open-btn').click();
        else if (kind === 'constraint') {
            $('drawing-workbench').open = true;
            document.querySelector('.constraint-tools')?.scrollIntoView({ behavior: 'smooth' });
            notify('Select the constraint and its references in the workbench.');
        }
    }
});
historical = new HistoricalConsole($('console-view'), {
    beforeHost: () => penController.stop(),
    action: safe(action => { penController.selected = [...selection]; penController.dispatch(action); meta = penController.meta; historical.latch('meta', meta); historical.latch('hold', penController.hold); refreshPanels(); dirty = true; }),
    input: (bit, pressed) => send('console-input', { kind: 'button', bit, pressed }),
    encoder: safe((key, value) => {
        const e = selectedEntities().find(e => e.type === 'instance'), moving = penController.motion;
        if (e && (key === 'scale' || key === 'angle')) {
            const scale = key === 'scale' ? 2 ** (value / 10) : Math.hypot(e.matrix[0], e.matrix[1]), angle = key === 'angle' ? value * Math.PI / 180 : Math.atan2(e.matrix[1], e.matrix[0]);
            const apply = () => { e.matrix = [Math.cos(angle) * scale, Math.sin(angle) * scale, -Math.sin(angle) * scale, Math.cos(angle) * scale, e.matrix[4], e.matrix[5]]; };
            if (moving) {
                apply();
                if (moving.instances?.has(e.id))
                    moving.instances.set(e.id, [...e.matrix]);
                doc.solve({ instancePins: new Map([[e.id, e.matrix]]) });
            }
            else
                edit('Turn instance encoder', apply);
        }
        else if (key === 'scale') {
            camera.zoom = 2 ** (value / 10);
            syncCamera();
        }
        else if (key === 'x' || key === 'y')
            camera[key] = value;
        else if (moving?.kind === 'text' && key === 'angle')
            doc.entities.get(moving.id).angle = value * Math.PI / 180;
        send('console-input', { kind: 'knob', q: { x: 1, y: 2, scale: 3, angle: 4 }[key], value: String((Math.round(value) % 512 + 512) % 512) });
        dirty = true;
    }),
    focus: value => { display.focus = value; dirty = true; },
    intensity: value => { display.intensity = value; dirty = true; }, persistence: value => { display.phosphor.persistence = value; dirty = true; }, spots: enabled => { display.spots = enabled; display.phosphor.clear(); dirty = true; },
    power: () => { dirty = true; },
    toggle: (address, value) => { penController.toggles.set(address, value); send('console-input', { kind: 'toggle', address, value: String(value) }); },
    selectPicture: safe(number => { let id = penController.pictureNumber(number); penController.stop(); if (!id) {
        id = doc.picture(`PICTURE ${number}`);
        doc.pictures.get(id).number = number;
    } doc.currentPicture = id; selection.clear(); penController.selected = []; refreshPanels(); fit(); historical.updatePicture(number); }),
    notify, view: activateView, guide: () => { $('help-dialog').showModal(); }
});
// Keyboard pen buttons avoid moving the pointer away from the drawing: D, C, M,
// Enter/Escape. Text input is captured before legacy one-key tool shortcuts.
document.addEventListener('keydown', safe(event => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || !$('console-view').classList.contains('active') || $('help-dialog').open || event.ctrlKey || event.metaKey || event.altKey)
        return;
    if (penController.motion?.kind === 'text' && (event.key.length === 1 || event.key === 'Backspace')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        penController.type(event.key);
        return;
    }
    if (!$('drawing-workbench').open) {
        const action = { d: 'draw', c: 'center', m: 'move', t: 'text', n: 'number', Enter: 'stop', Escape: 'stop' }[event.key] ?? { D: 'draw', C: 'center', M: 'move' }[event.key];
        if (action) {
            event.preventDefault();
            event.stopImmediatePropagation();
            penController.dispatch(action);
        }
    }
}), true);
$('program-select').innerHTML = Object.keys(PROGRAMS).map(name => `<option>${esc(name)}</option>`).join('');
function refreshLineNumbers() { const count = $('source-editor').value.split('\n').length; $('line-numbers').textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n'); }
function setSource(source, filename = 'diagnostic.tx2') { $('source-editor').value = source; sourceFilename = filename; $('source-filename').textContent = filename; refreshLineNumbers(); }
function assembleCurrent() { send('assemble', { source: $('source-editor').value, filename: sourceFilename, profile: ({ 'Vector diagnostic': 'diagnostic-word-io', 'TX-2 scope': 'tx2-io-research' })[$('program-select').value] ?? 'strict' }); }
$('program-select').addEventListener('change', () => { setSource(PROGRAMS[$('program-select').value]); assembleCurrent(); });
$('source-editor').addEventListener('input', () => { refreshLineNumbers(); $('assembly-stats').textContent = 'SOURCE MODIFIED — ASSEMBLE TO LOAD'; });
$('source-editor').addEventListener('scroll', () => { $('line-numbers').scrollTop = $('source-editor').scrollTop; });
$('source-editor').addEventListener('keydown', event => {
    if (event.key === 'Tab') {
        event.preventDefault();
        const e = event.target, start = e.selectionStart;
        e.setRangeText('    ', start, e.selectionEnd, 'end');
        refreshLineNumbers();
    }
});
button('assemble-btn', assembleCurrent);
button('step-btn', () => send('step'));
button('back-btn', () => send('back'));
button('run-btn', () => send('run'));
button('pause-btn', () => send('pause'));
button('reset-cpu-btn', () => send('reset'));
button('image-export-btn', () => send('image'));
button('source-open-btn', () => chooseFile('.tx2,.tx2as,.asm,.txt', async (file) => { setSource(await file.text(), file.name); notify('Source opened. Assembly is explicit and will report unsupported manuscript constructs.'); }));
function address() {
    const s = $('memory-address').value.replaceAll('_', '');
    if (!/^[0-7]{1,6}$/.test(s) || parseInt(s, 8) > 0o377777)
        throw new Error('Memory address must be 000000..377777 octal');
    return parseInt(s, 8);
}
button('memory-read-btn', () => send('memory', { address: address() }));
button('memory-write-btn', () => {
    const v = $('memory-value').value;
    if (!/^[0-7]{1,12}$/.test(v))
        throw new Error('Memory word must contain 1–12 octal digits');
    send('write', { address: address(), value: v });
});
$('watch-kind').addEventListener('change', safe(() => send('watch', { address: address(), kind: $('watch-kind').value })));
button('snapshot-save-btn', () => send('snapshot-save'));
button('snapshot-open-btn', () => chooseFile('.json', async (file) => send('snapshot-open', { text: await file.text() })));
function machineState(s) {
    const peripheral = $('peripheral-state');
    if (s.trap) peripheral.textContent = `TRAP 42  MODE ${s.trap.mode.toString(8).padStart(4,'0')}  HITS ${s.trap.count} · PETR 52  ${s.tape.position} FRAMES  ${s.tape.connected ? s.tape.direction.toUpperCase() : 'DISCONNECTED'}${s.tape.missed ? ' · OVERRUN' : ''}${s.bootingFromTape ? ' · READER-LEADER BOOT' : ''}`;
    else peripheral.textContent = '';
    const old = cpuState;
    cpuState = s;
    historical?.updateMachine(s);
    $('machine-profile').textContent = ({ 'strict': 'STRICT INSTRUCTION RESEARCH PROFILE', 'diagnostic-word-io': 'NONHISTORICAL DIAGNOSTIC WORD I/O PROFILE', 'tx2-io-research': 'TX-2 INOUT RESEARCH · SYNTHETIC INSTRUCTION TIMING' })[s.profile];
    $('cpu-registers').innerHTML = Object.entries({ P: s.P.toString(8).padStart(6, '0'), Q: s.Q.toString(8).padStart(6, '0'), ...s.registers, K: s.K.toString(8).padStart(2, '0') }).map(([k, v]) => `<div class="register ${old?.registers?.[k] && old.registers[k] !== v ? 'changed' : ''}">${k}${k in s.registers ? `<input data-register="${k}" value="${v}" aria-label="Register ${k} in octal">` : `<b>${v}</b>`}</div>`).join('');
    $('cpu-registers').querySelectorAll('[data-register]').forEach(input => input.addEventListener('change', safe(() => {
        if (!/^[0-7]{1,12}$/.test(input.value))
            throw new Error('Register requires an octal 36-bit word');
        send('register', { name: input.dataset.register, value: input.value });
    })));
    $('cpu-state').textContent = `${s.running ? 'RUNNING' : 'STOPPED'} · ${s.cycles.toLocaleString()} instructions · ${s.reason}${s.overflow ? ' · OVERFLOW' : ''}`;
    $('cpu-state').classList.toggle('fault', /not |Unmapped|Parity|Unknown|no verified/i.test(s.reason));
    $('back-btn').disabled = !s.historyDepth;
    $('run-btn').disabled = s.running;
    $('pause-btn').disabled = !s.running;
    $('index-registers').innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<span>X${i.toString(8).padStart(2, '0')} ${s.X[i]} · F${i.toString(8).padStart(2, '0')} ${s.F[i]}</span>`).join('');
    $('listing').innerHTML = s.listing.map(l => `<tr class="${l.address === (s.P & 0o377777) ? 'current' : ''}" data-address="${l.address}"><td class="breakpoint">${s.breakpoints.includes(l.address) ? '●' : '·'}</td><td>${l.address.toString(8).padStart(6, '0')}</td><td>${l.word}</td><td>${esc(l.text)}</td><td>${l.line}</td></tr>`).join('');
    $('listing').querySelectorAll('tr').forEach(row => row.addEventListener('click', () => send('breakpoint', { address: Number(row.dataset.address) })));
    $('memory-grid').innerHTML = s.memory.map(m => `<div class="memory-word ${m.watch ? 'watched' : ''}" data-address="${m.address}" data-value="${m.value}"><span>${m.address.toString(8).padStart(6, '0')}${m.meta ? 'ᵐ' : ''}</span>${m.value}</div>`).join('');
    $('memory-grid').querySelectorAll('.memory-word').forEach(row => row.addEventListener('click', () => { $('memory-address').value = Number(row.dataset.address).toString(8).padStart(6, '0'); $('memory-value').value = row.dataset.value; }));
    $('trace-output').textContent = s.trace.map(t => `${String(t.cycle).padStart(7)}  ${t.pc.toString(8).padStart(6, '0')}  ${t.text}`).join('\n');
    $('trace-output').scrollTop = $('trace-output').scrollHeight;
    const c = $('machine-display'), ctx = c.getContext('2d');
    ctx.fillStyle = '#08130c';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#b5d391';
    ctx.fillStyle = '#6d8b5e';
    ctx.font = '10px monospace';
    if (s.scope?.length) {
        ctx.fillStyle = '#d4ddd9';
        for (const spot of s.scope) {
            ctx.globalAlpha = Math.max(.1, spot.intensity);
            const x = c.width / 2 + spot.x * c.width / 1024, y = c.height / 2 - spot.y * c.height / 1024;
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    else if (s.vectors.length) {
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        s.vectors.forEach((p, i) => i ? ctx.lineTo(p.x * 1.1 + 55, p.y * .65 + 18) : ctx.moveTo(p.x * 1.1 + 55, p.y * .65 + 18));
        ctx.stroke();
    }
    else {
        ctx.fillText('No display events', 16, 27);
        ctx.fillText('Scope 60: select the TX-2 scope diagnostic', 16, 49);
        ctx.fillText('Vector example uses a nonhistorical endpoint.', 16, 71);
    }
}
button('boot-tape-btn', () => { worker.postMessage({ type: 'boot-assembled', source: $('source-editor').value, filename: sourceFilename }); notify('Stopped at plugboard. Run executes the reader bootstrap; entry is a breakpoint.'); });
button('tape-export-btn', () => worker.postMessage({ type: 'punch-tape' }));
worker.onmessage = ({ data }) => {
    if (data.type === 'ready') {
        assembleCurrent();
        return;
    }
    if (data.type === 'state')
        machineState(data.state);
    if (data.type === 'assembly') {
        $('diagnostic-count').textContent = data.diagnostics.length;
        $('assembly-stats').textContent = data.diagnostics.length ? 'ASSEMBLY FAILED — IMAGE NOT LOADED' : `${data.stats.wordCount} WORDS · ${data.stats.symbolCount} SYMBOLS`;
        $('diagnostics').classList.toggle('error', !!data.diagnostics.length);
        $('diagnostics').innerHTML = data.diagnostics.length ? data.diagnostics.map(d => `<div class="diag" data-line="${d.line}">${esc(d.file)}:${d.line} · ${esc(d.code)} · ${esc(d.message)}</div>`).join('') : `Assembly successful. ${data.stats.wordCount} machine words emitted with source locations. STOP is a debugger breakpoint.`;
        $('diagnostics').querySelectorAll('[data-line]').forEach(d => d.addEventListener('click', () => { const e = $('source-editor'), lines = e.value.split('\n'), start = lines.slice(0, Number(d.dataset.line) - 1).reduce((s, l) => s + l.length + 1, 0); e.focus(); e.setSelectionRange(start, start + (lines[Number(d.dataset.line) - 1]?.length ?? 0)); e.scrollTop = (Number(d.dataset.line) - 5) * 21.6; }));
    }
    if (data.type === 'error')
        notify(data.message);
    if (data.type === 'download')
        download(data.name, data.bytes ?? data.text, data.bytes ? 'application/octet-stream' : 'application/json');
};
worker.onerror = event => notify(`Machine worker failed: ${event.message}`);
$('archive-files').innerHTML = ORIGINALS.map((entry, i) => `<div class="archive-file"><div><h3>${entry.name}</h3><div class="file-sha">GIT BLOB ${entry.blob}</div><p>${entry.bytes.toLocaleString()} ORIGINAL BYTES · PINNED CONTENT</p></div><button data-original="${i}">Fetch & verify</button></div>`).join('');
async function inspectOriginal(bytes, name, entry = null) { const digest = await gitBlobHash(bytes), match = entry ?? ORIGINALS.find(e => e.blob === digest), source = new TextDecoder('utf-8', { fatal: true }).decode(bytes), report = auditListing(source); archive = { bytes, name, source, digest, verified: !!match, report }; $('archive-report').textContent = `${archive.verified ? 'VERIFIED PINNED BYTES' : 'UNVERIFIED LOCAL SOURCE'}\n${name} · ${bytes.length.toLocaleString()} bytes\nGit blob: ${digest}\n\n${report.lines} source lines\n${report.archivalPageRecords} archival page records\n${report.macroDefinitions} manuscript macro definitions\n${report.glyphKinds} distinct markup glyphs\n${report.duplicateEqualities.length} repeated equality names across archival sections\n${report.uncertainAnnotations.length} editorial uncertainty / handwritten annotations\n\nOriginal bytes retained unchanged. Normalization is a separate parsing view.\nA hash match is not proof of transcription correctness.\nFull M4 assembly and original Sketchpad execution are NOT available in this build.`; notify(archive.verified ? 'Original listing bytes verified against the pinned Git blob.' : 'Local listing loaded for inspection; not a recognized pinned original.'); }
document.querySelectorAll('[data-original]').forEach(b => b.addEventListener('click', safe(async () => {
    b.disabled = true;
    b.textContent = 'Fetching…';
    try {
        const result = await fetchOriginal(ORIGINALS[Number(b.dataset.original)], { signal: AbortSignal.timeout(30000) });
        await inspectOriginal(result.bytes, result.entry.name, result.entry);
    }
    finally {
        b.disabled = false;
        b.textContent = 'Fetch & verify';
    }
})));
button('archive-import-btn', () => chooseFile('.tx2as,.txt,.asm', async (file) => {
    if (file.size > 4000000)
        throw new Error('Listing exceeds 4 MB limit');
    await inspectOriginal(new Uint8Array(await file.arrayBuffer()), file.name);
}));
button('archive-inspect-btn', () => {
    if (!archive)
        throw new Error('Fetch or import a listing first');
    setSource(archive.source, archive.name);
    $('program-select').value = 'Accumulator';
    activateView('assembly');
    notify('Original source opened unchanged. Native M4 assembly reports unresolved constructs; original-program boot is not verified.');
});
button('archive-download-btn', () => {
    if (!archive)
        throw new Error('No original source loaded');
    download(archive.name, archive.bytes, 'text/plain');
});
setSource(PROGRAMS.Accumulator);
attachDocument();
requestAnimationFrame(render);
let saved = null;
try {
    saved = localStorage.getItem('sketchpad-lab.autosave');
}
catch { }
if (saved) {
    $('status-message').textContent = 'A previous local autosave is available. Open the field guide for controls.';
    const restore = document.createElement('button');
    restore.textContent = 'Restore autosave';
    restore.className = 'quiet';
    restore.addEventListener('click', safe(() => { const next = new SketchDocument(); next.restore(saved); next.solve(); replaceDocument(next); restore.remove(); notify('Restored previous local autosave.'); }));
    document.querySelector('.file-tools').append(restore);
}
const initial = location.hash.slice(1);
if (['console', 'assembly', 'debugger', 'archive'].includes(initial))
    activateView(initial);
window.sketchpadLab = { get controller() { return penController; }, get historical() { return historical; }, get document() { return doc; }, get display() { return display; }, get camera() { return camera; }, get machine() { return cpuState; }, setTool, fit, replaceDocument, sendMachine: send, get selected() { return [...selection]; }, select(ids) { selection = new Set(ids); refreshPanels(); }, render() { dirty = true; } };
