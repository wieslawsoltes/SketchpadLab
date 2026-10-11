import {assemble,encodeBinaryTape} from '../tx2-assembler/index.js';
import {TX2GateBoard} from './tx2-board.js';
import {DigitalSimulator,Waveform} from './digital.js';
import {TimedSimulator} from './timed.js';
import {ElectricalSimulator} from './electrical.js';
import {MixedSignalSimulator} from './mixed.js';
import {GPUClockedSimulator} from './webgpu.js';
import {observeBoard} from './observe.js';
import {ARITY,GATE_NAMES,writeBus} from './logic.js';
const numeric=(n,low,high,label)=>{if(!Number.isFinite(n)||n<low||n>high)throw new RangeError(`Invalid ${label}`);return n;};
export const hardwareJSON=value=>JSON.stringify(value,(_key,v)=>typeof v==='bigint'?{$bigint:v.toString()}:ArrayBuffer.isView(v)?Array.from(v):v);
/** UI-independent session. The worker is a thin transport around this controller.
 * Reload/restore are transactional, and long runs yield to allow pause/disposal. */
export class HardwareSession {
    constructor(){this.configuration=null;this.simulator=null;this.gpu=null;this.busy=false;this.cancelled=false;this.samples=[];this.saved=null;this.lastRun=null;this.pendingPen=null;}
    async load(configuration){
        if(this.busy)throw new Error('Pause the current run before loading a circuit');
        const candidate=new HardwareSession();this.busy=true;
        try{await candidate._load(configuration);this.dispose();Object.assign(this,candidate);return this.summary();}
        catch(error){candidate.dispose();throw error;}finally{this.busy=false;}
    }
    async _load({kind='board',source='',backend='cpu',memory='macro',extended=true,dialect='explicit',delayModel='inertial',inout=false,boot='image',deviceOptions={}}={}){
        if(!['board','netlist','timed','electrical','mixed'].includes(kind)||!['cpu','webgpu'].includes(backend)||!['explicit','m4'].includes(dialect)||
            typeof source!=='string'||source.length>32*1024*1024||typeof extended!=='boolean'||typeof inout!=='boolean'||!['image','tape'].includes(boot))throw new Error('Invalid hardware session configuration');
        if(backend==='webgpu'&&!['board','netlist'].includes(kind))throw new Error('WebGPU is for clocked gates; electrical/timed solving uses the CPU');
        if(!deviceOptions||typeof deviceOptions!=='object'||Array.isArray(deviceOptions)||
            Object.keys(deviceOptions).some(k=>!['readerPeriod','rewindPeriod','scopePeriod','punchPeriod','traceDepth'].includes(k))||
            Object.values(deviceOptions).some(v=>!Number.isSafeInteger(v)||v<1||v>65535))throw new Error('Invalid device options');
        if(boot==='tape'&&(kind!=='board'||!inout||memory!=='macro'))throw new Error('Tape boot requires INOUT and full-address-space RAM macros');
        this.configuration={kind,source,backend,memory,extended,dialect,delayModel,inout,boot,deviceOptions:{...deviceOptions}};this.kind=kind;
        if(kind==='board'){
            const image=assemble(source,{dialect});if(image.diagnostics.some(d=>d.severity!=='warning'))throw new Error(image.diagnostics.map(d=>`Line ${d.line}: ${d.message}`).join('\n'));
            this.board=new TX2GateBoard(image,{memory,depth:memory==='gates'?256:131072,extended,inout,bootTape:boot==='tape'?encodeBinaryTape(image):null,deviceOptions});this.simulator=this.board.simulator;
        }else{
            const document=JSON.parse(source);
            this.simulator=kind==='electrical'?new ElectricalSimulator(document):kind==='mixed'?new MixedSignalSimulator(document):
                kind==='timed'?new TimedSimulator(document.netlist??document,{delayModel}):new DigitalSimulator(document.netlist??document);
            if(kind==='timed'){
                if(document.stimulus!==undefined&&(!Array.isArray(document.stimulus)||document.stimulus.length>10000))throw new Error('Stimulus budget exceeded');
                for(const e of document.stimulus??[])e.clock?this.simulator.clock(e.at):this.simulator.input(e.input,e.value,e.at);
            }
        }
        if(backend==='webgpu'){this.gpu=await GPUClockedSimulator.create(this.simulator);await this.gpu.settle();}
        const d=this.digital();
        if(d){const preferred=inout?['phase','K','P','N','A','E','tapePosition','scopeCount','retired','halt']:['phase','P','N','A','B','E','writeEnable','retired','halt'];
            this.probes=this.kind==='board'?preferred:Object.keys(d.plan.outputs).slice(0,12);
            this.wave=new Waveform(d.plan,this.probes,{limit:4096,tickNs:1});
            this.driver=new Map(d.plan.gates.map(g=>[g.q,{kind:GATE_NAMES[g.op],pins:[g.a,g.b,g.c].slice(0,ARITY[g.op])}]));
            for(const f of d.plan.flops)this.driver.set(f.q,{kind:'DFF',pins:[f.d,f.enable,f.reset]});
            for(const m of d.plan.memories)for(const p of m.read)this.driver.set(p,{kind:`RAM ${m.name}`,pins:[...m.address,m.write]});
        }
        this.capture();
    }
    digital(){return this.kind==='mixed'?this.simulator?.digital:['board','netlist','timed'].includes(this.kind)?this.simulator:null;}
    electrical(){return this.kind==='mixed'?this.simulator?.electrical:this.kind==='electrical'?this.simulator:null;}
    capture(){
        const e=this.electrical(),d=this.digital();
        if(e){const row={time:e.time,values:Object.fromEntries(e.nodes.filter(n=>n!=='0').map(n=>[n,e.voltage(n)])),currents:Object.fromEntries(e.components.filter(c=>c.branch!==undefined).map(c=>[c.name,e.branchCurrent(c.name)]))};
            if(d)for(const [name,bus]of Object.entries(d.plan.outputs))row.values[`digital.${name}`]=d.values[bus[0]]<2?d.values[bus[0]]:null;
            while(this.samples.length&&this.samples.at(-1).time>=row.time)this.samples.pop();this.samples.push(row);if(this.samples.length>4096)this.samples.shift();
        }
        if(d&&this.kind!=='timed')this.wave.capture(d);
    }
    async advance({operation='run',budget=1000,step=1e-5,until=null,breakpoint=null}={},onProgress=()=>{}){
        if(!this.simulator)throw new Error('Enable and build hardware first');if(this.busy)throw new Error('Hardware session is busy');
        if(!['run','clock','instruction','operatingPoint'].includes(operation)||!Number.isInteger(budget)||budget<1||budget>100000)throw new RangeError('Invalid operation or clock/step budget');
        if(operation==='instruction'&&this.kind!=='board')throw new Error('Instruction stepping requires the TX-2 gate board');
        if(operation==='operatingPoint'&&this.kind!=='electrical')throw new Error('Operating-point solve requires an electrical circuit');
        if(breakpoint!==null&&(!Number.isInteger(breakpoint)||breakpoint<0||breakpoint>0o377777))throw new RangeError('Invalid breakpoint');
        if(this.electrical())numeric(step,1e-15,1,'time step');
        if(this.kind==='timed'){
            const target=until??this.simulator.time+100;
            if(!Number.isSafeInteger(target)||target<this.simulator.time)throw new RangeError('Invalid nanosecond endpoint');until=target;
        }
        this.busy=true;this.cancelled=false;let executed=0,reason='budget',lastYield=performance.now(),start=lastYield;
        const initialRetired=this.kind==='board'?this.simulator.read('retired'):null;
        try{
            if(operation==='operatingPoint'){this.simulator.operatingPoint();executed=1;this.capture();reason='operating point';}
            else while(executed<(operation==='clock'?1:operation==='instruction'?100000:budget)&&!this.cancelled){
                if(this.kind==='board'&&this.simulator.read('halt')){reason='board fault';break;}
                if(this.kind==='board'&&operation==='run'&&breakpoint!==null&&this.simulator.read('phase')===0n&&(this.simulator.read('P')&0o377777n)===BigInt(breakpoint)){reason='breakpoint';break;}
                this.applyPen();
                if(this.kind==='timed'){
                    if(this.simulator.time===until){reason='endpoint';break;}
                    this.simulator.runUntil(Math.min(until,this.simulator.time+10));
                }else if(this.kind==='mixed'||this.kind==='electrical'){
                    let dt=step;const e=this.electrical();
                    for(const c of e.components)if(c.source?.pwl&&e.overrides[c.name]===undefined)
                        for(const [time]of c.source.pwl)if(time>e.time&&time<e.time+dt){dt=time-e.time;break;}
                    this.simulator.step(dt);
                }else if(this.gpu)await this.gpu.clock();else this.simulator.clock();
                executed++;this.capture();
                if(operation==='instruction'&&this.simulator.read('retired')!==initialRetired&&(!this.board.board.inout||this.simulator.read('phase')!==3n||this.simulator.read('limbo'))){reason='instruction';break;}
                if(performance.now()-lastYield>16){onProgress(this.summary());await new Promise(resolve=>setTimeout(resolve,0));lastYield=performance.now();}
            }
            this.applyPen();
            if(this.cancelled)reason='paused';
            else if(this.kind==='board'&&this.simulator.read('halt'))reason='board fault';
            this.lastRun={executed,reason,wallMs:performance.now()-start};this.busy=false;return this.summary();
        }finally{this.busy=false;}
    }
    /** Coalesced external input. During async GPU evaluation only this pending
     * record changes; actual wire inputs are applied at the next safe boundary. */
    pen({x,y,down,radius=8}={}){
        if(!this.board?.board.inout)throw new Error('Light pen requires an INOUT gate board');
        if(!Number.isInteger(x)||x < -511||x > 511||!Number.isInteger(y)||y < -511||y > 511||
            typeof down!=='boolean'||!Number.isInteger(radius)||radius<0||radius>1023)throw new RangeError('Invalid light-pen input');
        this.pendingPen={x,y,down,radius};if(!this.busy)this.applyPen();
    }
    applyPen(){
        if(!this.pendingPen)return;const p=this.pendingPen;this.pendingPen=null;
        if(!this.board?.board.inout)return;
        const s=this.simulator,encode=n=>BigInt(n<0?1023^(-n):n);
        for(const [name,value]of Object.entries({penX:encode(p.x),penY:encode(p.y),penDown:BigInt(p.down),penRadius:BigInt(p.radius)}))
            writeBus(s.values,s.plan.inputs[name],value);
        // External input establishes a new reversal origin, as DigitalSimulator.input does.
        s.history.length=0;s.settle();
    }
    pause(){this.cancelled=true;}
    back(){if(this.busy)throw new Error('Pause before reversing');if(!this.simulator?.back())throw new Error('No retained reverse step');this.capture();return this.summary();}
    checkpoint(){if(this.busy||!this.simulator)throw new Error('Pause an active simulation before saving');this.saved=this.simulator.snapshot();return this.summary();}
    restoreCheckpoint(){if(this.busy||!this.saved)throw new Error('No paused checkpoint to restore');this.simulator.restore(this.saved);this.capture();return this.summary();}
    exportSnapshot(){if(this.busy||!this.simulator)throw new Error('Pause before exporting');return hardwareJSON({schema:'hardware-session-1',configuration:{...this.configuration,backend:'cpu'},state:this.simulator.snapshot()});}
    async restoreSnapshot(text){
        if(this.busy||typeof text!=='string'||text.length>64*1024*1024)throw new Error('Invalid snapshot size or active simulation');
        const data=JSON.parse(text);if(data?.schema!=='hardware-session-1'||data.configuration?.backend!=='cpu')throw new Error('Invalid snapshot document');
        const candidate=new HardwareSession();this.busy=true;
        try{await candidate._load(data.configuration);candidate.simulator.restore(data.state);candidate.samples=[];candidate.wave&&(candidate.wave.samples=[]);candidate.capture();}
        catch(error){candidate.dispose();throw error;}finally{this.busy=false;}
        this.dispose();Object.assign(this,candidate);return this.summary();
    }
    timedWave(){
        const d=this.simulator,values=d.traceBase.slice(),wave=new Waveform(d.plan,this.probes,{limit:4096,tickNs:1});
        wave.capture({ticks:d.traceBaseTime,values});for(const event of d.trace){for(const [pin,value]of event.changes)values[pin]=value;wave.capture({ticks:event.time,values});}
        if(d.time>d.traceBaseTime)wave.capture({ticks:d.time,values});return wave;
    }
    exportTrace(){
        if(!this.simulator)throw new Error('No simulation');
        if(this.electrical())return hardwareJSON({units:{time:'seconds',voltages:'volts',currents:'amperes',digital:'dimensionless 0/1; null is unknown'},samples:this.samples});
        return (this.kind==='timed'?this.timedWave():this.wave).vcd();
    }
    exportNetlist(){const d=this.digital();if(!d)throw new Error('This model has no digital netlist');const {levels,order,fanout,...plan}=d.plan;return hardwareJSON(plan);}
    inspect(port,bit=0){
        const d=this.digital(),bus=d?.plan.outputs[port]??d?.plan.inputs[port];
        if(!bus||!Number.isInteger(bit)||bit<0||bit>=bus.length)throw new Error('Invalid signal probe');
        const seen=new Set(),queue=[{pin:bus[bit],depth:0}],nodes=[];
        while(queue.length&&nodes.length<48){const {pin,depth}=queue.shift();if(seen.has(pin))continue;seen.add(pin);
            const driver=this.driver.get(pin);const inputs=driver?.pins??[];
            nodes.push({pin,depth,name:d.plan.names[pin]||`wire_${pin}`,driver:driver?.kind??'input / constant',value:'01XZ'[d.values[pin]],inputs});
            if(depth<3)for(const p of inputs.slice(0,8))queue.push({pin:p,depth:depth+1});
        }return {port,bit,nodes};
    }
    summary(){
        if(!this.simulator)return {powered:false};const d=this.digital(),e=this.electrical(),s=this.simulator;
        const ports=d?Object.entries(d.plan.outputs).map(([name,bus])=>{const bits=bus.map(pin=>d.values[pin]).reverse().map(bit=>'01XZ'[bit]).join('');
            return {name,width:bus.length,bits,value:/[XZ]/.test(bits)?bits:BigInt('0b'+bits).toString(8).padStart(Math.ceil(bus.length/3),'0')};}):[];
        const wave=d?(this.kind==='timed'?this.timedWave():this.wave):null;
        return {powered:true,kind:this.kind,backend:this.gpu?'webgpu-gates':this.kind==='timed'?'cpu-timed-gates':e?'cpu-electrical':'cpu-gates',busy:this.busy,
            ticks:d?.ticks??null,time:this.kind==='timed'?s.time:e?.time??null,units:this.kind==='timed'?'ns':e?'s':'logical clocks',ports,
            statistics:d?.stats?.()??{wires:d?.plan.names.length??0,gates:d?.plan.gates.length??0,events:s.processed??0},
            electrical:e?{iterations:e.iterations,residual:e.residual,solved:e.iterations>0,nodes:e.nodes.length-1,components:e.components.length}:null,
            series:this.samples.slice(-256),signals:wave?.signals.map(p=>({name:p.name,width:p.bus.length})),wave:wave?.samples.slice(-256),
            checkpoint:!!this.saved,reversible:s.history?.length??0,lastRun:this.lastRun,inout:observeBoard(this.board),
            gpu:this.gpu?{evaluations:this.gpu.evaluator.evaluations,dispatches:this.gpu.evaluator.dispatches}:null};
    }
    dispose(){this.pause();this.gpu?.dispose();this.gpu=null;this.simulator=null;this.board=null;this.wave=null;this.driver=null;this.samples=[];this.saved=null;this.pendingPen=null;}
}
