/** Optional controls and read-only visualization of gate-produced I/O storage.
 * This module never invents device transfers or updates the instruction machine. */
export function mountHardwareIO({dialog,request,changed}) {
    const el=id=>dialog.querySelector('#'+id);
    const controls=document.createElement('span');controls.style.display='contents';
    controls.innerHTML='<label><input id="hw-inout" type="checkbox">Sequence / INOUT cards</label><select id="hw-boot" aria-label="Hardware load method"><option value="image">Load image</option><option value="tape">Execute tape bootstrap</option></select><label id="hw-period-label">Tape clocks/frame <input id="hw-reader-period" type="number" min="1" max="65535" value="128"></label>';
    el('hw-build').before(controls);
    const section=document.createElement('div');section.className='hw-section';section.hidden=true;
    section.innerHTML='<h3>GATE I/O</h3><select id="hw-io-view" aria-label="Hardware observation view"><option value="scope">Scope / transport</option><option value="cone">Gate driver cone</option></select>';
    const cone=el('hw-cone'),coneHeading=cone.previousElementSibling;
    coneHeading.before(section);
    const panel=document.createElement('div');panel.id='hw-io-panel';panel.className='hw-drawing';panel.hidden=true;
    panel.style.cssText='height:280px;min-height:250px;overflow:auto;flex:none;padding:0 10px';
    panel.innerHTML='<div id="hw-transport" role="status" style="font:10px/1.5 ui-monospace,monospace;color:#c1d4b5;padding:5px;white-space:pre-wrap"></div><canvas id="hw-scope" aria-label="Scope spots emitted by TX-2 gate transfers; drag to use light pen" style="height:185px;min-height:185px;touch-action:none;cursor:crosshair"></canvas><div id="hw-pen-status" style="font:10px/1.5 ui-monospace,monospace;padding:3px 5px;color:#a7b59b"></div>';
    cone.after(panel);
    let state=null,lastPen={x:0,y:0,down:false,radius:16},frame=0,dirty=false;
    const visible=()=>{
        const on=!!state?.inout,scope=el('hw-io-view').value==='scope';
        section.hidden=!on;panel.hidden=!on||!scope;cone.hidden=on&&scope;coneHeading.hidden=on&&scope;
    };
    function draw(){
        const data=state?.inout,canvas=el('hw-scope'),rect=canvas.getBoundingClientRect();if(!data||panel.hidden||rect.width<1)return;
        const dpr=globalThis.devicePixelRatio||1,w=rect.width,h=rect.height;
        canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const c=canvas.getContext('2d');c.scale(dpr,dpr);
        c.fillStyle='#070e09';c.fillRect(0,0,w,h);const span=Math.min(w-30,h-20),x0=w/2,y0=h/2;
        c.strokeStyle='#273b2b';c.strokeRect(x0-span/2,y0-span/2,span,span);
        c.beginPath();c.moveTo(x0-span/2,y0);c.lineTo(x0+span/2,y0);c.moveTo(x0,y0-span/2);c.lineTo(x0,y0+span/2);c.stroke();
        for(const p of data.scope.points){const x=x0+p.x*span/1022,y=y0-p.y*span/1022;
            c.fillStyle='#b4e69833';c.beginPath();c.arc(x,y,3.5,0,2*Math.PI);c.fill();
            c.fillStyle='#d7ffc4';c.fillRect(x-.65,y-.65,1.3,1.3);
        }
        const pen=data.pen,px=x0+pen.x*span/1022,py=y0-pen.y*span/1022;
        c.strokeStyle=pen.down?'#ffda9d':'#778873';c.beginPath();c.arc(px,py,Math.max(3,pen.radius*span/1022),0,2*Math.PI);c.stroke();
        c.fillStyle='#aebda5';c.font='10px ui-monospace,monospace';c.fillText('−511 … +511',8,h-7);
        c.fillText('TSD spots only',8,13);
    }
    function render(next){
        state=next;visible();if(!next?.inout)return;
        const d=next.inout,t=d.tape;
        el('hw-transport').textContent=`K ${d.sequence.toString(8).padStart(2,'0')} · clock ${d.clock} · ${d.limbo?'LIMBO':'active'}\nTAPE ${t.position}/${t.frames} · ${t.rewinding?'rewinding':t.connected?'connected':'disconnected'}${t.missed?' · OVERRUN':''} · SCOPE ${d.scope.count} spots · PUNCH ${d.punch.count} frames`;
        el('hw-pen-status').textContent=`Drag the scope to illuminate the pen · hits ${d.pen.hits} · TRAP mode ${d.trap.mode.toString(8)} · ${d.scope.dropped} older spots not displayed`;
        draw();
    }
    const configuration=()=>({inout:el('hw-inout').checked,boot:el('hw-boot').value,
        deviceOptions:{readerPeriod:Number(el('hw-reader-period').value)}});
    function refresh(busy,current){
        const board=el('hw-kind').value==='board',on=el('hw-inout').checked;
        el('hw-inout').parentElement.hidden=!board;el('hw-boot').hidden=!board||!on;el('hw-period-label').hidden=!board||!on;
        for(const id of ['hw-inout','hw-boot','hw-reader-period'])el(id).disabled=busy;
        // Hiding the cards must not leave a stale tape-boot selection enabled.
        if(!board||!on)el('hw-boot').value='image';
        if(board&&on&&el('hw-boot').value==='tape')el('hw-memory').value='macro';
        el('hw-memory').disabled=busy||(board&&on&&el('hw-boot').value==='tape');
        if(board)el('hw-boundary').textContent=on?
            'Gate-built sequence, tape, scope and TRAP research cards. Periods are logical clocks, not calibrated electrical timing. The bootstrap runs original loader words, not the full original Sketchpad application.':
            'Synthesized research hardware, not a transcription of original TX-2 circuit cards. Gate execution is independent of the instruction emulator. This mode does not boot the original Sketchpad program.';
    }
    function selectExample(example){
        el('hw-inout').checked=!!example.inout;el('hw-boot').value=example.boot??'image';el('hw-reader-period').value='128';
        el('hw-extended').checked=example.extended??true;
        el('hw-breakpoint').value=example.boot==='tape'?'100':'';
        if(example.inout){el('hw-memory').value='macro';el('hw-budget').value=example.boot==='tape'?'50000':'6000';el('hw-io-view').value='scope';}
    }
    function restoreConfiguration(c){
        el('hw-inout').checked=!!c.inout;el('hw-boot').value=c.boot??'image';el('hw-reader-period').value=String(c.deviceOptions?.readerPeriod??128);
        el('hw-memory').value=c.memory??'macro';el('hw-extended').checked=c.extended??true;el('hw-dialect').value=c.dialect??'explicit';
    }
    for(const id of ['hw-inout','hw-boot','hw-reader-period'])el(id).addEventListener('change',changed);
    el('hw-io-view').onchange=()=>{visible();draw();};
    function send(){frame=0;if(!dirty||!state?.inout||!state.powered||!globalThis.sketchpadHardware?.powered)return;dirty=false;
        request('pen',{pen:lastPen}).catch(error=>{el('hw-pen-status').textContent=error.message;});
    }
    const position=(event,down)=>{
        if(!state?.inout)return;const box=el('hw-scope').getBoundingClientRect(),span=Math.min(box.width-30,box.height-20);
        lastPen={x:Math.max(-511,Math.min(511,Math.round((event.clientX-box.left-box.width/2)*1022/span))),
            y:Math.max(-511,Math.min(511,Math.round((box.height/2-event.clientY+box.top)*1022/span))),down,radius:16};
        dirty=true;if(!frame)frame=requestAnimationFrame(send);
    };
    const canvas=el('hw-scope');canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);position(e,true);};
    canvas.onpointermove=e=>position(e,!!(e.buttons&1));canvas.onpointerup=e=>position(e,false);canvas.onpointercancel=e=>position(e,false);
    dialog.addEventListener('close',()=>{if(state?.inout){lastPen={...lastPen,down:false};dirty=true;send();}});
    new ResizeObserver(draw).observe(canvas);
    return {configuration,refresh,render,selectExample,restoreConfiguration};
}
