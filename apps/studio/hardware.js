import {mountHardwareIO} from './hardware-io.js';
import {hardwareExamples} from '../../packages/hardware-sim/examples.js';
const STYLE=`
#hardware-dialog{--hw-bg:#111714;--hw-panel:#19221d;--hw-line:#35433a;--hw-muted:#9bac9d;--hw-ink:#e7eee5;--hw-green:#b4dc89;position:fixed;inset:0;width:calc(100vw - 32px);max-width:1680px;height:calc(100dvh - 32px);max-height:none;margin:auto;padding:0;border:1px solid #637762;border-radius:10px;background:var(--hw-bg);color:var(--hw-ink);box-shadow:0 30px 100px #0009;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;overflow:hidden}
#hardware-dialog::backdrop{background:#050906bd;backdrop-filter:blur(4px)}
#hardware-dialog *{box-sizing:border-box}#hardware-dialog [hidden]{display:none!important}#hardware-dialog[open]{display:flex;flex-direction:column}
#hardware-dialog button,#hardware-dialog input,#hardware-dialog select,#hardware-dialog textarea{font:inherit;color:inherit}
#hardware-dialog button{cursor:pointer;border:1px solid var(--hw-line);border-radius:4px;background:#26342b;padding:6px 10px;white-space:nowrap}
#hardware-dialog button:hover{background:#344837}#hardware-dialog button:disabled{opacity:.4;cursor:default}
#hardware-dialog button:focus-visible,#hardware-dialog select:focus-visible,#hardware-dialog textarea:focus-visible,#hardware-dialog input:focus-visible{outline:2px solid var(--hw-green);outline-offset:2px}
#hardware-dialog .hw-primary{background:#b4dc89;color:#152310;border-color:#b4dc89;font-weight:700}
#hardware-dialog select,#hardware-dialog input{border:1px solid var(--hw-line);background:#121b16;padding:6px;border-radius:4px;max-width:100%}
#hardware-dialog h2,#hardware-dialog h3,#hardware-dialog p{margin:0}#hardware-dialog h2{font-size:20px;font-weight:600;letter-spacing:-.5px}#hardware-dialog h3{font-size:11px;letter-spacing:1.3px;color:var(--hw-muted);font-weight:600}
#hardware-dialog .hw-head{display:flex;gap:18px;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--hw-line)}
#hardware-dialog .hw-kicker{font-size:10px;letter-spacing:2px;color:var(--hw-green)}#hardware-dialog .hw-head p{color:var(--hw-muted);font-size:12px}
#hardware-dialog .hw-head-actions{display:flex;gap:8px;align-items:center}#hardware-dialog .hw-dot{width:7px;height:7px;border-radius:50%;background:#72806e;display:inline-block;margin-right:6px}#hardware-dialog[data-powered=true] .hw-dot{background:var(--hw-green);box-shadow:0 0 9px #b4dc8977}
#hardware-dialog .hw-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid var(--hw-line)}#hardware-dialog .hw-controls label{display:flex;align-items:center;gap:6px;color:var(--hw-muted);font-size:11px}
#hardware-dialog .hw-controls input{width:80px}#hardware-dialog .hw-controls #hw-example{max-width:280px}#hardware-dialog .hw-flex{flex:1}
#hardware-dialog .hw-boundary{font-size:11px;color:#c5bd98;padding:7px 20px;background:#27281c;border-bottom:1px solid #42432c}
#hardware-dialog .hw-body{display:grid;grid-template-columns:minmax(270px,340px) minmax(300px,1fr) minmax(215px,270px);gap:1px;background:var(--hw-line);min-height:0;flex:1;overflow:auto}
#hardware-dialog .hw-left,#hardware-dialog .hw-center,#hardware-dialog .hw-right{background:var(--hw-bg);min-width:0;display:flex;flex-direction:column;min-height:0}
#hardware-dialog .hw-section{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 13px;background:var(--hw-panel);border-bottom:1px solid var(--hw-line)}
#hardware-dialog .hw-section small{font-size:10px;color:var(--hw-muted)}#hardware-dialog .hw-section button{padding:2px 6px;font-size:11px}
#hardware-dialog #hw-source{width:100%;min-height:260px;flex:1;resize:none;background:#121a15;color:#d7e2d2;outline:none;border:0;padding:16px;font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;tab-size:4}
#hardware-dialog .hw-source-note{padding:10px 13px;font-size:11px;color:var(--hw-muted);border-top:1px solid var(--hw-line)}
#hardware-dialog .hw-source-note summary{cursor:pointer;color:var(--hw-green)}#hardware-dialog .hw-source-note p{padding-top:8px}
#hardware-dialog .hw-readouts{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--hw-line);border-bottom:1px solid var(--hw-line)}
#hardware-dialog .hw-readout{background:var(--hw-panel);padding:15px 12px}#hardware-dialog .hw-readout strong{display:block;font:22px/1.2 ui-monospace,monospace;color:var(--hw-green);font-weight:400}#hardware-dialog .hw-readout span{font-size:9px;color:var(--hw-muted);letter-spacing:1px}
#hardware-dialog .hw-display{min-height:260px;position:relative;padding:0 10px;background:radial-gradient(ellipse at 50% 40%,#1a281c,#101712);flex:1}
#hardware-dialog canvas{width:100%;height:100%;min-height:260px;display:block}#hardware-dialog .hw-empty{position:absolute;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none;padding:30px}#hardware-dialog .hw-empty strong{font-size:18px;font-weight:500;color:#c4d2bd}#hardware-dialog .hw-empty p{max-width:350px;color:var(--hw-muted);font-size:12px;margin-top:10px}
#hardware-dialog .hw-drawing{height:230px;min-height:180px;border-top:1px solid var(--hw-line);overflow:auto;padding:6px}#hardware-dialog .hw-drawing svg{width:100%;height:210px;min-width:400px}
#hardware-dialog .hw-probes{padding:8px 12px;overflow:auto;flex:1;font-family:ui-monospace,monospace}
#hardware-dialog .hw-probe{display:flex;justify-content:space-between;gap:8px;padding:5px 4px;border-bottom:1px solid #28342d;cursor:pointer;font-size:12px}#hardware-dialog .hw-probe:hover{background:#293c2d}#hardware-dialog .hw-probe span{color:#a9bda4}#hardware-dialog .hw-probe b{font-weight:400;color:#d5e8c2;overflow-wrap:anywhere;text-align:right}
#hardware-dialog .hw-inspect-controls{display:flex;gap:6px;padding:10px 12px}#hardware-dialog #hw-probe{min-width:0;flex:1}#hardware-dialog #hw-bit{width:54px}
#hardware-dialog #hw-status{padding:9px 20px;min-height:40px;border-top:1px solid var(--hw-line);font:11px/1.7 ui-monospace,monospace;color:#bdceaf;white-space:pre-wrap;max-height:100px;overflow:auto;overflow-wrap:anywhere}#hardware-dialog #hw-status[data-error=true]{color:#f8b69c;background:#332019}
#hardware-dialog .hw-exports{display:flex;gap:5px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid var(--hw-line)}#hardware-dialog .hw-exports button{font-size:10px;padding:5px 7px}
@media(max-width:1100px){#hardware-dialog .hw-body{grid-template-columns:270px minmax(300px,1fr)}#hardware-dialog .hw-right{grid-column:1/-1;display:block;min-height:120px}#hardware-dialog .hw-probes{max-height:170px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 12px}#hardware-dialog .hw-center,#hardware-dialog .hw-left{min-height:480px}}
@media(max-width:650px){#hardware-dialog{width:100vw;height:100dvh;border-radius:0;border:0}#hardware-dialog .hw-head{padding:12px}.hw-head p{display:none}#hardware-dialog .hw-body{display:flex;flex-direction:column;background:var(--hw-bg)}#hardware-dialog .hw-center{order:0;min-height:520px;flex:none}#hardware-dialog .hw-left{order:1;min-height:380px;flex:none;border-top:1px solid var(--hw-line)}#hardware-dialog .hw-right{order:2;min-height:230px;flex:none;border-top:1px solid var(--hw-line)}#hardware-dialog .hw-controls{padding:8px;gap:5px}#hardware-dialog .hw-controls select{max-width:160px}#hardware-dialog .hw-boundary{padding:6px 10px;max-height:75px;overflow:auto}#hardware-dialog .hw-readout{padding:10px 8px}#hardware-dialog .hw-readout strong{font-size:17px}#hardware-dialog .hw-probes{grid-template-columns:repeat(2,minmax(0,1fr))}#hardware-dialog #hw-status{padding:6px 10px}#hardware-dialog .hw-drawing{height:180px}#hardware-dialog .hw-drawing svg{height:170px;min-width:320px}}
`;
const $=(root,id)=>root.querySelector('#'+id);
function save(name,text){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Optional modal workspace: the original console and instruction machine are
 * kept alive and unchanged. Closing pauses; Power off frees the hardware worker. */
export function mountHardwareWorkbench(){
    if(document.querySelector('#hardware-dialog'))return;
    const style=document.createElement('style');style.textContent=STYLE;document.head.append(style);
    const button=document.createElement('button');button.id='hardware-open';button.textContent='Hardware';button.title='Optional gate and electrical simulation';
    document.querySelector('.header-actions').prepend(button);
    const dialog=document.createElement('dialog');dialog.id='hardware-dialog';dialog.setAttribute('aria-labelledby','hw-title');dialog.dataset.powered='false';
    dialog.innerHTML=`<div class="hw-head"><div><div class="hw-kicker">SKETCHPAD LAB / OPTIONAL RESEARCH MODE</div><h2 id="hw-title">Hardware laboratory</h2><p>Inspect the wires. Clock the gates. Solve the circuit.</p></div><div class="hw-head-actions"><span id="hw-power"><i class="hw-dot"></i>OFF</span><button id="hw-off">Power off</button><button id="hw-close" aria-label="Close hardware laboratory">✕</button></div></div>
    <div class="hw-controls"><select id="hw-example" aria-label="Hardware example"></select><select id="hw-kind" aria-label="Model kind"><option value="board">TX-2 gate board</option><option value="netlist">Custom clocked netlist</option><option value="timed">Timed gates</option><option value="electrical">Electrical transient</option><option value="mixed">Mixed signal</option></select><select id="hw-backend" aria-label="Gate backend"><option value="cpu">CPU · event driven</option><option value="webgpu">WebGPU · level dispatch</option></select><select id="hw-memory" aria-label="Gate memory implementation"><option value="macro">STUV RAM macro</option><option value="gates">256-word gate RAM</option></select><label><input id="hw-extended" type="checkbox" checked>48-op arithmetic</label><button id="hw-build" class="hw-primary">Enable & build</button></div>
    <div class="hw-boundary" id="hw-boundary">Synthesized research hardware, not a transcription of original TX-2 circuit cards. Gate execution is independent of the instruction emulator. This mode does not boot the original Sketchpad program.</div>
    <div class="hw-controls"><button id="hw-clock" data-needs-power>Clock / step</button><button id="hw-instruction" data-needs-power>Instruction →</button><button id="hw-run" data-needs-power>▶ Run</button><button id="hw-pause">Ⅱ Pause</button><button id="hw-back" data-needs-power>← Reverse</button><button id="hw-op" data-needs-power>DC solve</button><span class="hw-flex"></span><label>Budget <input id="hw-budget" type="number" min="1" max="100000" value="1000"></label><label id="hw-step-label">Δt (s) <input id="hw-step" type="number" min="1e-15" max="1" step="any" value="0.00001"></label><label id="hw-until-label">Until (ns) <input id="hw-until" type="number" min="0" max="1000000" value="100"></label><label id="hw-break-label">Break (oct) <input id="hw-breakpoint" placeholder="none" aria-label="Gate breakpoint in octal"></label></div>
    <div class="hw-body"><div class="hw-left"><div class="hw-section"><h3>MODEL SOURCE</h3><select id="hw-dialect" aria-label="Hardware assembly dialect"><option value="explicit">TX-2 explicit</option><option value="m4">Native M4</option></select><button id="hw-import-source">Open</button></div><textarea id="hw-source" spellcheck="false" autocapitalize="off" aria-label="Hardware model source"></textarea><div class="hw-source-note"><details><summary>Model and fidelity contract</summary><p>Clocked gates use four states: 0, 1, X, Z. Timed gates have specified propagation delays. RLC, diode, and bipolar transistor models solve voltages and currents. Mixed mode holds DAC voltages, integrates, samples ADCs, then clocks digital storage. These are different simulation abstractions, not interchangeable levels of historical accuracy.</p><p>RAM macro mode does not model magnetic cores. Gate RAM explicitly instantiates every bit. Electrical models do not include original component characterization. Optional sequence/INOUT cards execute scheduling, supported device handshakes, TRAP marking and the published tape bootstrap independently. Electrical card fidelity remains unverified.</p></details></div></div>
    <div class="hw-center"><div class="hw-readouts"><div class="hw-readout"><strong id="hw-counter">—</strong><span id="hw-counter-label">LOGICAL CLOCKS</span></div><div class="hw-readout"><strong id="hw-gates">—</strong><span id="hw-gates-label">BOOLEAN GATES</span></div><div class="hw-readout"><strong id="hw-storage">—</strong><span id="hw-storage-label">FLIP-FLOPS</span></div><div class="hw-readout"><strong id="hw-speed">—</strong><span>LAST RUN · STEPS / S</span></div></div><div class="hw-section"><h3 id="hw-wave-title">LOGIC ANALYZER</h3><small id="hw-wave-units">No assumed physical clock period</small><button id="hw-trace" data-needs-power>Export trace</button></div><div class="hw-display"><canvas id="hw-wave" aria-label="Hardware simulation waveforms"></canvas><div id="hw-empty" class="hw-empty"><strong>Hardware is powered off</strong><p>The original Sketchpad workspace is unaffected. Choose a model, then Enable & build to allocate the independent simulator.</p></div></div><div class="hw-section"><h3 id="hw-cone-title">GATE CONNECTIVITY</h3><small>Actual driver cone · bounded view</small></div><div id="hw-cone" class="hw-drawing"></div></div>
    <div class="hw-right"><div class="hw-section"><h3 id="hw-probe-title">SIGNAL PROBES</h3><small>Click to inspect</small></div><div class="hw-inspect-controls"><select id="hw-probe" aria-label="Signal to inspect"></select><input id="hw-bit" type="number" value="0" min="0" max="71" aria-label="Signal bit"><button id="hw-inspect" data-needs-power>Probe</button></div><div id="hw-probes" class="hw-probes"></div><div class="hw-exports"><button id="hw-checkpoint" data-needs-power>Checkpoint</button><button id="hw-restore" data-needs-power>Restore</button><button id="hw-snapshot" data-needs-power>Save state</button><button id="hw-open-state">Open state</button><button id="hw-netlist" data-needs-power>Export wiring</button></div></div></div>
    <div id="hw-status" role="status" aria-live="polite">OFF · No hardware worker allocated.</div><input id="hw-file" type="file" hidden>`;
    document.body.append(dialog);const el=id=>$(dialog,id),examples=hardwareExamples();
    for(const [index,e]of examples.entries())el('hw-example').add(new Option(e.name,String(index)));
    let worker=null,bootstrapURL=null,sequence=0,busy=false,modelDirty=true,state=null,cone=null,restoreFile=false,pending=new Map();let io;
    const status=(text,error=false)=>{el('hw-status').textContent=text;el('hw-status').dataset.error=String(error);};
    function refreshControls(){
        const kind=el('hw-kind').value,digital=['board','netlist'].includes(kind),electrical=['electrical','mixed'].includes(kind);
        el('hw-backend').disabled=busy||!digital;el('hw-memory').hidden=kind!=='board';el('hw-dialect').hidden=kind!=='board';el('hw-extended').parentElement.hidden=kind!=='board';
        el('hw-instruction').hidden=kind!=='board';el('hw-op').hidden=kind!=='electrical';el('hw-step-label').hidden=!electrical;el('hw-until-label').hidden=kind!=='timed';el('hw-break-label').hidden=kind!=='board';
        for(const b of dialog.querySelectorAll('[data-needs-power]'))b.disabled=busy||!state?.powered;
        for(const id of ['hw-clock','hw-instruction','hw-run','hw-op'])el(id).disabled=busy||modelDirty||!state?.powered;
        el('hw-pause').disabled=!worker;el('hw-off').disabled=!worker;
        el('hw-build').disabled=busy;el('hw-example').disabled=busy;el('hw-kind').disabled=busy;el('hw-memory').disabled=busy;el('hw-extended').disabled=busy;
        el('hw-netlist').disabled=busy||!state?.powered||kind==='electrical';el('hw-restore').disabled=busy||!state?.checkpoint;el('hw-back').disabled=busy||!state?.reversible;
        el('hw-power').innerHTML=`<i class="hw-dot"></i>${worker?'ON':'OFF'}`;dialog.dataset.powered=String(!!worker);io?.refresh(busy,state,modelDirty);
    }
    function ensureWorker(){if(worker)return;
        // Classic bootstrap supports file:// and opaque-origin standalone previews.
        // Queue early requests until the dynamically imported module owns onmessage.
        const moduleURL=new URL('./hardware-worker.js',import.meta.url).href;
        const bootstrap=`const backlog=[];self.onmessage=e=>backlog.push(e.data);import(${JSON.stringify(moduleURL)}).then(()=>{const receive=self.onmessage;for(const data of backlog)receive({data});postMessage({event:'ready'});}).catch(error=>postMessage({event:'boot-error',error:error.message}));`;
        bootstrapURL=URL.createObjectURL(new Blob([bootstrap],{type:'text/javascript'}));worker=new Worker(bootstrapURL);
        const failed=message=>{worker?.terminate();worker=null;if(bootstrapURL){URL.revokeObjectURL(bootstrapURL);bootstrapURL=null;}
            status(message,true);for(const p of pending.values())p.reject(new Error(message));pending.clear();busy=false;state=null;window.sketchpadHardware.state=null;refreshControls();};
        worker.onmessage=({data})=>{
            if(data.event==='ready'){if(bootstrapURL){URL.revokeObjectURL(bootstrapURL);bootstrapURL=null;}return;}
            if(data.event==='boot-error'){failed('Hardware module failed: '+data.error);return;}
            if(data.event==='progress'){render(data.state);return;}const request=pending.get(data.id);if(!request)return;pending.delete(data.id);
            if(data.state)render(data.state);data.ok?request.resolve(data):request.reject(new Error(data.error));};
        worker.onerror=e=>failed('Hardware worker failed: '+(e.message||'No browser diagnostic was supplied.'));
        worker.onmessageerror=()=>failed('Hardware worker response could not be decoded.');
    }
    function call(op,body={}){ensureWorker();const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,op,...body});});}
    async function action(op,body={}){if(busy&&op!=='pause')return;const blocking=op!=='pause';if(blocking)busy=true;refreshControls();
        try{const result=await call(op,body);if(result.payload?.text)save(result.payload.filename,result.payload.text);else if(op==='inspect'){cone=result.payload;drawCone();}
            if(op==='load')status(`BUILT · ${state.backend} · ${state.statistics.gates?.toLocaleString()??0} gates · ${state.statistics.flipFlops?.toLocaleString()??0} flip-flops`);
            else if(state?.lastRun&&op==='advance')status(`${state.lastRun.reason.toUpperCase()} · ${state.lastRun.executed} accepted steps · ${state.lastRun.wallMs.toFixed(2)} ms wall time`);
            else if(op!=='inspect')status(`${op.toUpperCase()} · ${state?.backend??'ready'}`);
            return result;
        }catch(error){status(error.message,true);return null;}finally{if(blocking)busy=false;refreshControls();}}
    function render(next){state=next;window.sketchpadHardware.state=next;refreshControls();io?.render(next);if(!next.powered)return;
        el('hw-empty').hidden=true;const e=next.electrical,ports=next.ports??[];
        el('hw-counter').textContent=next.units==='logical clocks'?String(next.ticks):Number(next.time).toPrecision(4);el('hw-counter-label').textContent=next.units==='logical clocks'?'LOGICAL CLOCKS':`TIME · ${next.units}`;
        el('hw-gates').textContent=(e?e.components:next.statistics.gates??0).toLocaleString();el('hw-gates-label').textContent=e?'CIRCUIT COMPONENTS':'BOOLEAN GATES';
        el('hw-storage').textContent=(e?e.iterations:next.statistics.flipFlops??0).toLocaleString();el('hw-storage-label').textContent=e?'NEWTON ITERATIONS':'FLIP-FLOPS';
        el('hw-speed').textContent=next.lastRun?.wallMs>0?Math.round(1000*next.lastRun.executed/next.lastRun.wallMs).toLocaleString():'—';
        el('hw-wave-title').textContent=e?'TRANSIENT ANALYZER':'LOGIC ANALYZER';el('hw-wave-units').textContent=e?'SI units · V / logic 0–1 · time s':next.kind==='timed'?'Propagation delays · nanoseconds':'Logical clock count · not TX-2 physical timing';
        const readings=e?Object.entries(next.series.at(-1)?.values??{}).map(([name,v])=>({name,value:v===null?'X':v.toPrecision(7)})):
            ports.map(p=>({name:p.name,value:p.value}));
        el('hw-probes').replaceChildren(...readings.map(p=>{const row=document.createElement('div');row.className='hw-probe';row.tabIndex=0;row.innerHTML=`<span>${escape(p.name)}</span><b>${escape(p.value)}</b>`;
            if(!e)row.onclick=()=>{el('hw-probe').value=p.name;el('hw-bit').value='0';action('inspect',{port:p.name,bit:0});};return row;}));
        if(e)for(const [name,value]of Object.entries(next.series.at(-1)?.currents??{})){const row=document.createElement('div');row.className='hw-probe';row.innerHTML=`<span>I(${escape(name)})</span><b>${value.toExponential(4)} A</b>`;el('hw-probes').append(row);}
        const signature=ports.map(p=>p.name).join('|');if(el('hw-probe').dataset.signature!==signature){el('hw-probe').dataset.signature=signature;el('hw-probe').replaceChildren(...ports.map(p=>new Option(p.name,p.name)));}
        if(ports.some(p=>p.name==='halt'&&p.bits==='1'))status('BOARD FAULT · Unsupported instruction/control or arithmetic case. No instruction-emulator fallback was used.',true);
        drawWave();
    }
    function drawWave(){const canvas=el('hw-wave'),box=canvas.getBoundingClientRect();if(box.width<1||box.height<1)return;const ratio=window.devicePixelRatio||1;
        canvas.width=Math.round(box.width*ratio);canvas.height=Math.round(box.height*ratio);const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);const w=box.width,h=box.height;ctx.clearRect(0,0,w,h);ctx.font='10px ui-monospace,monospace';
        ctx.strokeStyle='#2a3a2d';ctx.lineWidth=1;for(let x=80;x<w;x+=50){ctx.beginPath();ctx.moveTo(x,15);ctx.lineTo(x,h-25);ctx.stroke();}for(let y=25;y<h-25;y+=35){ctx.beginPath();ctx.moveTo(75,y);ctx.lineTo(w-10,y);ctx.stroke();}
        if(!state?.powered)return;
        if(state.electrical){const rows=state.series;if(!rows.length)return;const names=Object.keys(rows.at(-1).values).slice(0,7),values=rows.flatMap(r=>names.map(n=>r.values[n]).filter(Number.isFinite));
            let min=Math.min(0,...values),max=Math.max(1,...values);const range=max-min||1;max+=range*.1;min-=range*.1;
            const start=rows[0].time,end=rows.at(-1).time||1e-9;
            names.forEach((name,index)=>{ctx.strokeStyle=`hsl(${90+index*47} 48% 68%)`;ctx.fillStyle=ctx.strokeStyle;ctx.fillText(name,12+index%3*(w/3),16+Math.floor(index/3)*14);ctx.beginPath();let connected=false;
                for(const row of rows){const v=row.values[name];if(v===null||!Number.isFinite(v)){connected=false;continue;}const x=78+(w-90)*(row.time-start)/Math.max(end-start,1e-15),y=h-36-(h-98)*(v-min)/(max-min);connected?ctx.lineTo(x,y):ctx.moveTo(x,y);connected=true;}ctx.stroke();});
            ctx.fillStyle='#9bad94';ctx.fillText(max.toFixed(2)+' V',6,70);ctx.fillText(min.toFixed(2)+' V',6,h-38);ctx.fillText(start.toExponential(2)+' s',80,h-8);ctx.fillText(end.toExponential(2)+' s',w-100,h-8);
        }else{const rows=state.wave??[],names=(state.signals??[]).slice(0,10);if(!rows.length)return;const start=rows[0].tick,end=Math.max(start+1,rows.at(-1).tick),height=Math.max(19,(h-48)/Math.max(names.length,1));
            names.forEach((signal,index)=>{const y=24+index*height;ctx.fillStyle='#b9ccb0';ctx.fillText(signal.name,5,y+5);ctx.strokeStyle='#b6d99b';ctx.beginPath();let prev=null,lastLabel=-100;
                for(const row of rows){const bits=row.bits[index],unknown=/[xz]/.test(bits),value=unknown?null:BigInt('0b'+bits),x=78+(w-90)*(row.tick-start)/(end-start),top=y-(height*.26);
                    const v=signal.width===1?(value===0n?y+height*.23:value===1n?top:y):top;
                    if(prev){ctx.lineTo(x,prev.v);if(v!==prev.v)ctx.lineTo(x,v);}else ctx.moveTo(x,v);
                    if(signal.width>1&&x-lastLabel>80){ctx.fillStyle=unknown?'#eab58d':'#b6d99b';ctx.fillText(unknown?bits:value.toString(8),x+3,y+4);lastLabel=x;}prev={v};}
                if(prev)ctx.lineTo(w-12,prev.v);ctx.stroke();});ctx.fillStyle='#9bad94';ctx.fillText(String(start),80,h-8);ctx.fillText(String(end)+' '+state.units,w-140,h-8);
        }
    }
    function drawCone(){const root=el('hw-cone');if(!cone){el('hw-cone-title').textContent='GATE CONNECTIVITY';root.innerHTML='<p style="padding:20px;color:#9bac9d">Select a digital signal to inspect its actual drivers and wires.</p>';return;}
        const groups=Array.from({length:4},()=>[]);for(const n of cone.nodes)groups[n.depth].push(n);const pos=new Map();
        groups.forEach((nodes,depth)=>nodes.forEach((n,i)=>pos.set(n.pin,{x:640-depth*180,y:18+i*36})));
        let body='';for(const n of cone.nodes){const to=pos.get(n.pin);for(const p of n.inputs){const from=pos.get(p);if(from)body+=`<path d="M${from.x+140},${from.y+13} C${from.x+150},${from.y+13} ${to.x-25},${to.y+13} ${to.x},${to.y+13}" fill="none" stroke="#476349"/>`;}}
        for(const n of cone.nodes){const p=pos.get(n.pin);body+=`<g transform="translate(${p.x},${p.y})"><rect width="140" height="27" rx="3" fill="#26362a" stroke="${n.value==='1'?'#b4dc89':'#526752'}"/><text x="5" y="11" fill="#dce7d5" font-size="10">${escape(n.driver)} · ${n.value}</text><text x="5" y="22" fill="#a4b699" font-size="9">${escape(n.name.slice(0,20))}</text><title>${escape(n.name)} · pin ${n.pin}</title></g>`;}
        const height=Math.max(215,...groups.map(nodes=>nodes.length*36+36));
        root.innerHTML=`<svg viewBox="80 0 715 ${height}" style="height:${height}px;min-width:715px" role="img" aria-label="Actual gate driver cone">${body}</svg>`;el('hw-cone-title').textContent=`${cone.port}[${cone.bit}] · DRIVER CONE`;
    }
    function selectExample(){modelDirty=true;const e=examples[Number(el('hw-example').value)];el('hw-source').value=e.source;el('hw-kind').value=e.kind;el('hw-backend').value='cpu';el('hw-budget').value=['electrical','mixed'].includes(e.kind)?'200':'1000';el('hw-step').value=e.kind==='electrical'?'0.000001':'0.00001';el('hw-until').value='100';io?.selectExample(e);refreshControls();}
    button.onclick=()=>{dialog.showModal();drawWave();};el('hw-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(worker)call('pause').catch(()=>{});});dialog.addEventListener('keydown',e=>e.stopPropagation());
    el('hw-example').onchange=selectExample;
    const changed=()=>{modelDirty=true;refreshControls();status('SOURCE CHANGED · Rebuild before executing. The previous circuit state is retained.');};
    el('hw-source').oninput=changed;for(const id of ['hw-kind','hw-backend','hw-memory','hw-extended','hw-dialect'])el(id).onchange=changed;
    el('hw-build').onclick=async()=>{status('Building the selected circuit in the hardware worker…');cone=null;drawCone();const result=await action('load',{configuration:{kind:el('hw-kind').value,source:el('hw-source').value,backend:el('hw-backend').disabled?'cpu':el('hw-backend').value,memory:el('hw-memory').value,extended:el('hw-extended').checked,dialect:el('hw-dialect').value,...io.configuration()}});if(result?.ok){modelDirty=false;refreshControls();}};
    for(const [id,operation]of [['hw-clock','clock'],['hw-instruction','instruction'],['hw-run','run'],['hw-op','operatingPoint']])el(id).onclick=()=>{
        const raw=el('hw-breakpoint').value.trim();if(raw&&!/^[0-7]{1,6}$/.test(raw)){status('Breakpoint must be an octal address.',true);return;}
        action('advance',{options:{operation,budget:Number(el('hw-budget').value),step:Number(el('hw-step').value),until:Number(el('hw-until').value),breakpoint:raw?parseInt(raw,8):null}});
    };
    for(const [id,op]of [['hw-pause','pause'],['hw-back','back'],['hw-checkpoint','checkpoint'],['hw-restore','restore'],['hw-snapshot','snapshot'],['hw-trace','trace'],['hw-netlist','netlist']])el(id).onclick=()=>action(op);
    el('hw-inspect').onclick=()=>action('inspect',{port:el('hw-probe').value,bit:Number(el('hw-bit').value)});
    el('hw-off').onclick=()=>{worker?.terminate();worker=null;if(bootstrapURL){URL.revokeObjectURL(bootstrapURL);bootstrapURL=null;}for(const p of pending.values())p.reject(new Error('Hardware powered off'));pending.clear();busy=false;modelDirty=true;state=null;window.sketchpadHardware.state=null;io?.render({powered:false});for(const id of ['hw-counter','hw-gates','hw-storage','hw-speed'])el(id).textContent='—';el('hw-empty').hidden=false;el('hw-probes').replaceChildren();cone=null;drawCone();drawWave();refreshControls();status('OFF · Hardware worker and simulation storage released.');};
    el('hw-import-source').onclick=()=>{restoreFile=false;el('hw-file').value='';el('hw-file').click();};el('hw-open-state').onclick=()=>{restoreFile=true;el('hw-file').value='';el('hw-file').click();};
    el('hw-file').onchange=async()=>{const file=el('hw-file').files?.[0];if(!file)return;if(file.size>(restoreFile?64:32)*1024*1024){status('File exceeds the hardware import budget.',true);return;}
        try{const text=await file.text();if(restoreFile){const result=await action('restoreFile',{text});if(result?.ok){const data=JSON.parse(text);modelDirty=false;el('hw-source').value=data.configuration.source;el('hw-kind').value=data.configuration.kind;el('hw-backend').value='cpu';io.restoreConfiguration(data.configuration);refreshControls();}}
        else{el('hw-source').value=text;changed();}}catch(error){status(error.message,true);}};
    new ResizeObserver(()=>{if(dialog.open)drawWave();}).observe(el('hw-wave'));
    window.sketchpadHardware={get powered(){return !!worker;},state:null,open:()=>{dialog.showModal();drawWave();}};
    io=mountHardwareIO({dialog,request:call,changed});
    selectExample();drawCone();refreshControls();
}
