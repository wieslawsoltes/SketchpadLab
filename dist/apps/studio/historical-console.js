/** Physical-console reconstruction. The cabinet arrangement follows the 1963
 * photographs; pushbutton bit assignments follow Sutherland's thesis Appendix B.
 * This is DOM/CSS hardware, NOT a bitmap over non-functional hotspots.
 * Photo dimensions, panel legends, and unassigned switches are not asserted exact.
 */
const escape = value => String(value).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
export const PUSHBUTTONS = Object.freeze([
    ['1.1', 'GARBAGE', 'garbage'], ['1.2', 'DEL CONS', 'deleteConstraints'], ['1.3', 'DELETE', 'delete'],
    ['1.4', 'DEL FREE', 'deleteFree'], ['1.5', 'DEL PIC', 'deletePicture'], ['1.6', 'STOP', 'stop'],
    ['1.7', 'CEN CIR', 'center'], ['1.8', 'DRAW', 'draw'], ['1.9', 'COPY 23', 'copy23'],
    ['2.1', 'MOVE', 'move'], ['2.2', 'DESIGNATE', 'designate'], ['2.3', 'CHANGE', 'change'],
    ['2.4', 'INSTANCE', 'instance'], ['2.5', 'COPY 22', 'copy22'], ['2.6', 'TIE', 'tie'],
    ['2.7', 'UNFIX', 'unfix'], ['2.8', 'CONSTRAINT', 'constraint'], ['2.9', 'HORV', 'horv'],
    ['3.1', 'COPY 21', 'copy21'], ['3.2', '—', null], ['3.3', 'FIX', 'fix'],
    ['3.4', '—', null], ['3.5', '—', null], ['3.6', 'COPY 20', 'copy20'],
    ['3.7', 'NUMBER', 'number'], ['3.8', '—', null], ['3.9', 'LIBRARY', 'library'],
    ['4.1', '—', null], ['4.2', '—', null], ['4.3', 'TEXT / IBM', 'text'],
    ['4.4', 'DISMEMBER', 'dismember'], ['4.5', 'DISORDER', 'disorder'], ['4.6', 'ORDER', 'order'],
    ['4.7', 'PUNCH', 'punch'], ['4.8', 'PLOT', 'plot'], ['4.9', 'HOLD', 'hold'],
    ['4.10', 'META', 'meta']
]);
const hex = n => Number(n).toString(8).padStart(6, '0');
function lampRow(name, width = 36) {
    return `<div class="register-row" data-register="${name}"><span class="register-name">${name}</span><div class="lamp-strip" style="--register-bits:${width}" aria-hidden="true">${Array.from({ length: width }, (_, i) => `<i class="bit-lamp" data-bit="${width - i - 1}"></i>`).join('')}</div><output class="register-octal">${'0'.repeat(Math.ceil(width / 3))}</output></div>`;
}
function knob(id, label, min, max, value) {
    return `<label class="physical-encoder"><span class="encoder-legend">${label}</span><span class="rotary-control" id="${id}-dial"><span></span></span><input id="${id}" type="range" min="${min}" max="${max}" value="${value}" aria-label="${label}"><output>${value}</output></label>`;
}
function plate(label) { return `<span class="engraved-plate">${label}</span>`; }
export class HistoricalConsole {
    constructor(host, bridge) {
        this.bridge = bridge;
        this.toggles = new Map(Array.from({ length: 8 }, (_, i) => [0o20 + i, 0n]));
        this.meta = false;
        this.hold = false;
        this.powered = true;
        this.pen = { x: 0, y: 0 };
        this.host = host;
        this.lastRegisters = new Map();
        this.keyTime = 0;
        const legacy = [...host.children];
        const drawer = document.createElement('details');
        drawer.id = 'drawing-workbench';
        drawer.className = 'drawing-workbench';
        drawer.innerHTML = '<summary>DRAWING WORKBENCH <span>geometry · constraints · pictures · files</span></summary>';
        for (const node of legacy)
            drawer.append(node);
        const cabinet = document.createElement('div');
        cabinet.className = 'historical-station';
        cabinet.innerHTML = `
 <div class="station-caption"><span>LINCOLN LABORATORY · TX-2</span><span>1962–63 OPERATING CONSOLE</span><div><button id="historical-cabinet-only" aria-pressed="false">CONSOLE ONLY</button><button id="historical-tools">OPEN WORKBENCH</button></div></div>
 <div class="console-cabinet">
  <section class="rack rack-left" aria-label="Reference documents and auxiliary controls">
   <div class="reference-clipboard" aria-label="Modern quick-reference card, not a facsimile"><b>TX-2</b><small>OPERATOR REFERENCE</small><div class="reference-grid">S &nbsp; 000000–177777<br>T &nbsp; 200000–207777<br>U &nbsp; 210000–217777<br>V &nbsp; 377600–377777</div><span>36-BIT WORD · ONE'S COMPLEMENT</span></div>
   <div class="telephone-panel" aria-hidden="true" title="Telephone silhouette; not emulated"><div class="telephone-back"><div class="telephone-dial"></div><i class="telephone-handset"></i></div><div class="telephone-cord"></div></div>
   <div class="auxiliary-controls"><button id="scope-power" class="black-control" aria-label="Display power" aria-pressed="true"></button><span class="panel-legend">DISPLAY<br>ON — OFF</span><i class="cabinet-connector" aria-hidden="true"></i></div>
   <div class="scope-adjustments"><label>INTENSITY<input id="historical-intensity" aria-label="Phosphor intensity" type="range" min="25" max="150" value="90"></label><label>FOCUS<input id="historical-focus" aria-label="Beam focus" type="range" min="35" max="180" value="100"></label></div>
   <div class="scope-adjustments"><label class="persistence-control">AFTERGLOW<input id="historical-persistence" aria-label="Phosphor persistence" type="range" min="0" max="3000" value="600"></label></div>
   <label class="panel-legend spot-toggle"><input id="spot-display" type="checkbox" checked> SPOT-GENERATED DISPLAY</label>
   <div class="rack-title small">${plate('ACTIVITY LOG · MODERN TOOL')}</div><div class="writer-paper" id="console-log" role="log" aria-label="Console activity">SKETCHPAD
READY.</div>
  </section>
  <section class="rack rack-display" aria-label="TX-2 cathode ray display">
   <div class="scope-blanking-panels" aria-hidden="true"><i></i><i></i><i></i></div><div class="scope-top-panel"><span class="small-screw"></span><div class="trim-controls"><i></i><i></i><i></i></div>${plate('DISPLAY SCOPE No. 1')}<span class="small-screw"></span></div>
   <div class="number-strip" aria-label="Picture selector">${Array.from({ length: 10 }, (_, i) => `<button data-picture-digit="${9 - i}" title="Select picture ${9 - i}">${9 - i}</button>`).join('')}</div>
   <div class="scope-bezel"><span class="bezel-screw tl"></span><span class="bezel-screw tr"></span><span class="bezel-screw bl"></span><span class="bezel-screw br"></span><div class="scope-tube"><div id="historic-screen-mount"></div></div></div>
   <div class="scope-legend">${plate('LIGHT PEN')}<span class="pen-signal"><i id="pen-lamp"></i>TRACKING</span><span class="screen-mechanics" aria-hidden="true"><i></i><i></i></span></div>
   <div class="encoder-instrument"><div class="shaft-readout" id="shaft-readout">00·00</div>${plate('SHAFT ENCODER — 377620')}<div class="shaft-readout" id="picture-readout">00·01</div></div>
   <div class="physical-encoders">${knob('historical-x', 'X POSITION', -1000, 1000, 0)}${knob('historical-y', 'Y POSITION', -1000, 1000, 0)}${knob('historical-scale', 'SIZE', -30, 35, 0)}${knob('historical-angle', 'ROTATION', -180, 180, 0)}</div>
  </section>
  <section class="rack rack-right" aria-label="Control element, sequence flags and toggle storage">
   <div class="rack-title">${plate('CONTROL & ARITHMETIC ELEMENTS')}</div>
   <div class="instrument-bank"><div class="sequence-indicators">${lampRow('K', 6)}${lampRow('P', 18)}${lampRow('N', 36)}${lampRow('FA', 5)}${lampRow('F', 9)}${lampRow('X', 18)}${lampRow('Q', 18)}</div>
   <div class="arithmetic-indicators">${['D', 'A', 'B', 'C', 'E'].map(r => lampRow(r)).join('')}${lampRow('Z', 6)}</div></div>
   <div class="flag-bank" aria-label="Live sequence flags">${[0,...Array.from({length:32},(_,i)=>0o40+i)].map(unit=>`<span class="sequence-flag" data-sequence-unit="${unit}" title="Sequence ${unit.toString(8)} flag"><i></i><small>${unit.toString(8).padStart(2,'0')}</small></span>`).join('')}</div>
   <div class="rack-title small">${plate('TOGGLE SWITCH STORAGE')}</div>
   <div class="toggle-area"><div class="panel-legend toggle-heading">TOGGLE REGISTER SELECT</div><div class="toggle-bit-numbers">${Array.from({ length: 18 }, (_, i) => `<span>${18 - i}</span>`).join('')}</div>${Array.from(this.toggles, ([address]) => `<div class="toggle-register" data-toggle-register="${address}"><label>${address.toString(8)}<input class="toggle-value" aria-label="Toggle register ${address.toString(8)} in octal" value="000000000000" maxlength="12"></label><div class="toggle-halves">${[1, 0].map(half => `<div class="toggle-strip">${Array.from({ length: 18 }, (_, i) => { const bit = half * 18 + 17 - i; return `<button type="button" class="mini-toggle" aria-label="Register ${address.toString(8)} bit ${bit + 1}" data-toggle-bit="${bit}" aria-pressed="false"><i></i></button>`; }).join('')}</div>`).join('')}</div></div>`).join('')}</div>
   <div class="panel-legend register-use">20–23 COPY DEFINITION &nbsp; 25 PICTURE / CONSTRAINT<br>26 TAPE &nbsp; 27 LIBRARY RECORD</div>
   <div class="sequence-control"><button class="square-physical" data-host-click="reset-cpu-btn">START<br>OVER</button><button class="square-physical" data-host-click="step-btn">SINGLE<br>STEP</button><button class="square-physical" data-host-click="back-btn" title="Modern reversible-debugger control">REVERSE<br>STEP</button><button class="square-physical" data-host-click="run-btn">START</button><button class="square-physical dark-key" data-host-click="pause-btn">STOP</button><button class="square-physical" id="console-debugger">EXAMINE</button></div>
  </section>
 </div>
 <div class="console-desk">
  <section class="pushbutton-box" aria-label="Sketchpad 37-button box"><div class="buttonbox-heading">${plate('SKETCHPAD — PUSH BUTTONS')}<span>36 + META</span></div><div class="physical-key-matrix">${PUSHBUTTONS.map(([bit, label, action]) => `<button class="physical-key ${action === 'meta' ? 'meta-key' : ''}" data-console-action="${action ?? ''}" data-hardware-bit="${bit}" aria-label="${label} ${bit}" ${action ? '' : 'disabled'} title="${action ? `${label} · external input ${bit}` : 'Unassigned in the thesis button appendix'}"><i class="round-key-top"></i><span>${escape(label)}</span><small>${bit}</small></button>`).join('')}</div></section>
  <section class="pen-cradle"><div class="pen-wire"></div><button id="pen-shutter" aria-label="Light pen shutter" title="Flick the pen away (HOLD ignores one flick)"><span class="light-pen-body"><i></i></span></button>${plate('LIGHT PEN')}<div class="pen-instruction">MOVE THE PEN TO A POINT.<br>PRESS DRAW TO ANCHOR.<br>PRESS STOP TO FINISH.</div><div class="screen-coordinates" id="historic-coordinates">X 0000 &nbsp; Y 0000</div></section>
  <section class="operator-card"><h2>SKETCHPAD</h2><p>A MAN–MACHINE<br>GRAPHICAL COMMUNICATION SYSTEM</p><span>IVAN E. SUTHERLAND · 1963</span><div><button id="original-controls-guide">OPERATOR'S GUIDE</button><button data-host-click="undo-btn">UNDO</button><button data-host-click="redo-btn">REDO</button></div><small>Drawing reconstruction · original program not booted</small></section>
 </div>
 <details class="fidelity-ledger" id="fidelity-ledger"><summary>REFERENCE & FIDELITY RECORD <span>photographs · controls · limitations</span></summary><div><p><b>Visual reference:</b> Lincoln Laboratory P91-211 (1962), with control-panel organization from P91-113 (1961). The numbered strip, rectangular black CRT faceplate, four shaft encoders, separate button box, and off-screen controls follow those references.</p><p><b>Functional reference:</b> Sutherland's thesis, Appendix B, for button bit assignments. The activity log, reversible-debugger buttons, numeric readouts, and quick-reference card are modern additions. Physical key positions, cabinet dimensions, labels and beam photometry have not been measured or certified identical.</p><p><a href="https://tx-2.github.io/photographs.html" target="_blank" rel="noopener">Console photographs</a> · <a href="https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-574.pdf" target="_blank" rel="noopener">Thesis</a> · The drawing surface is a new implementation; the machine workbench runs instruction-level emulation.</p></div></details>`;
        host.append(cabinet, drawer);
        this.cabinet = cabinet;
        document.getElementById('historic-screen-mount').append(document.getElementById('stage'));
        document.querySelector('.display-shell').hidden = true;
        document.body.classList.add('historical-ui');
        cabinet.querySelectorAll('[data-host-click]').forEach(b => b.addEventListener('click', () => { bridge.beforeHost?.(); document.getElementById(b.dataset.hostClick)?.click(); }));
        cabinet.querySelectorAll('[data-console-action]').forEach(b => {
            const up = () => { b.classList.remove('pressed'); if (b.dataset.consoleAction)
                bridge.input?.(b.dataset.hardwareBit, false); };
            b.addEventListener('pointerdown', () => { b.classList.add('pressed'); bridge.input?.(b.dataset.hardwareBit, true); });
            b.addEventListener('pointerup', up);
            b.addEventListener('pointercancel', up);
            b.addEventListener('pointerleave', up);
            b.addEventListener('click', () => {
                const action = b.dataset.consoleAction;
                if (!action)
                    return;
                this.log(b.querySelector('span').textContent);
                bridge.action(action, this);
            });
        });
        cabinet.querySelectorAll('[data-toggle-register]').forEach(row => {
            const address = Number(row.dataset.toggleRegister), input = row.querySelector('input');
            input.addEventListener('change', () => { if (!/^[0-7]{1,12}$/.test(input.value)) {
                input.value = this.toggles.get(address).toString(8).padStart(12, '0');
                bridge.notify('Enter up to 12 octal digits.');
                return;
            } this.setToggle(address, BigInt('0o' + input.value)); });
            row.querySelectorAll('[data-toggle-bit]').forEach(b => b.addEventListener('click', () => this.setToggle(address, this.toggles.get(address) ^ (1n << BigInt(b.dataset.toggleBit)))));
        });
        cabinet.querySelectorAll('[data-picture-digit]').forEach(b => b.addEventListener('click', () => bridge.selectPicture(Number(b.dataset.pictureDigit))));
        const handlers = { x: 'x', y: 'y', scale: 'scale', angle: 'angle' };
        for (const [id, key] of Object.entries(handlers)) {
            const input = document.getElementById(`historical-${id}`), dial = document.getElementById(`historical-${id}-dial`);
            input.addEventListener('input', () => { const value = Number(input.value); dial.style.setProperty('--rotation', `${value * (id === 'scale' ? 6 : id === 'angle' ? 1 : .3)}deg`); input.nextElementSibling.value = value; bridge.encoder(key, value); });
            // Dragging the physical knob and operating its native range both work.
            let origin = null;
            dial.addEventListener('pointerdown', e => { origin = { y: e.clientY, value: Number(input.value) }; dial.setPointerCapture(e.pointerId); e.preventDefault(); });
            dial.addEventListener('pointermove', e => { if (!origin)
                return; input.value = String(origin.value + (origin.y - e.clientY) * (Number(input.max) - Number(input.min)) / 260); input.dispatchEvent(new Event('input')); });
            for (const ev of ['pointerup', 'pointercancel'])
                dial.addEventListener(ev, () => { origin = null; });
        }
        document.getElementById('historical-focus').addEventListener('input', e => bridge.focus?.(Number(e.target.value) / 100));
        document.getElementById('historical-cabinet-only').addEventListener('click', e => { const enabled = document.body.classList.toggle('cabinet-only'); e.currentTarget.setAttribute('aria-pressed', String(enabled)); e.currentTarget.textContent = enabled ? 'SHOW WORKSPACES' : 'CONSOLE ONLY'; });
        document.getElementById('historical-intensity').addEventListener('input', e => bridge.intensity(Number(e.target.value) / 100));
        document.getElementById('historical-persistence').addEventListener('input', e => bridge.persistence(Number(e.target.value)));
        document.getElementById('spot-display').addEventListener('change', e => bridge.spots(e.target.checked));
        document.getElementById('scope-power').addEventListener('click', e => { this.powered = !this.powered; e.currentTarget.setAttribute('aria-pressed', String(this.powered)); cabinet.classList.toggle('scope-off', !this.powered); bridge.power(this.powered); });
        document.getElementById('pen-shutter').addEventListener('click', () => bridge.action('flick', this));
        document.getElementById('historical-tools').addEventListener('click', () => { drawer.open = !drawer.open; if (drawer.open)
            drawer.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        document.getElementById('console-debugger').addEventListener('click', () => bridge.view('debugger'));
        document.getElementById('original-controls-guide').addEventListener('click', () => bridge.guide());
        this.setToggle(0o25, 1n);
    }
    setToggle(address, value) {
        if (!this.toggles.has(address) || typeof value !== 'bigint' || value < 0n || value > 68719476735n)
            throw new RangeError('Invalid toggle register');
        this.toggles.set(address, value);
        const row = this.cabinet.querySelector(`[data-toggle-register="${address}"]`);
        row.querySelector('input').value = value.toString(8).padStart(12, '0');
        row.querySelectorAll('[data-toggle-bit]').forEach(b => { const set = !!(value & (1n << BigInt(b.dataset.toggleBit))); b.classList.toggle('on', set); b.setAttribute('aria-pressed', String(set)); });
        this.bridge.toggle?.(address, value);
    }
    log(message) { const output = document.getElementById('console-log'); output.textContent = (output.textContent + '\n' + String(message)).split('\n').slice(-7).join('\n'); output.scrollTop = output.scrollHeight; }
    latch(action, value) { const button = this.cabinet.querySelector(`[data-console-action="${action}"]`); button?.classList.toggle('latched', value); button?.setAttribute('aria-pressed', String(value)); }
    updatePen(x, y, tracking) { this.pen = { x, y }; document.getElementById('pen-lamp').classList.toggle('on', tracking); document.getElementById('historic-coordinates').textContent = `X ${Math.round(x).toString().padStart(4, '0')}   Y ${Math.round(y).toString().padStart(4, '0')}`; }
    updatePicture(number) { document.getElementById('picture-readout').textContent = hex(number).replace(/(..)(..)(..)/, '$2·$3'); this.cabinet.querySelectorAll('[data-picture-digit]').forEach(b => b.classList.toggle('chosen', Number(b.dataset.pictureDigit) === number)); }
    updateMachine(machine) {
        if (!machine)
            return;
        const n = BigInt('0o' + (machine.N ?? '0'));
        const config = Number((n >> 30n) & 31n), index = Number((n >> 18n) & 63n);
        const flags = BigInt(machine.flags ?? '0');
        this.cabinet.querySelectorAll('[data-sequence-unit]').forEach(el => { const unit = Number(el.dataset.sequenceUnit); el.classList.toggle('raised', !!(flags & (1n << BigInt(unit)))); el.classList.toggle('current', unit === machine.K); });
        const values = { ...machine.registers, FA: BigInt(config), F: machine.F?.[config] ?? '0', X: machine.X?.[index] ?? '0', P: BigInt(machine.P ?? 0), Q: BigInt(machine.Q ?? 0), N: machine.N ?? '0', K: BigInt(machine.K ?? 0), Z: BigInt(machine.overflowFlags ?? (machine.overflow ? 8 : 0)) };
        for (const [name, raw] of Object.entries(values)) {
            const value = typeof raw === 'bigint' ? raw : BigInt('0o' + raw), row = this.cabinet.querySelector(`[data-register="${name}"]`);
            if (!row || this.lastRegisters.get(name) === value)
                continue;
            this.lastRegisters.set(name, value);
            row.querySelector('output').textContent = value.toString(8).padStart(Math.ceil(row.querySelectorAll('[data-bit]').length / 3), '0');
            row.querySelectorAll('[data-bit]').forEach(b => b.classList.toggle('lit', !!(value & (1n << BigInt(b.dataset.bit)))));
        }
    }
}
