import { Gate } from './logic.js';
import { muxWords } from './circuits.js';
import { multiplyCircuit } from './arithmetic-circuits.js';

export const INOUT_OPERATIONS = Object.freeze(['OPR','TSD']);
export const INOUT_UNITS = Object.freeze([0o42,0o52,0o55,0o60,0o63]);
const bounded=(n,lo,hi,name)=>{if(!Number.isSafeInteger(n)||n<lo||n>hi)throw new RangeError(`Invalid ${name}`);return n;};
const ge=(b,v,n)=>n===0?b.one:b.add(v,b.constant((2**v.length)-n,v.length)).carry;
const dec=(b,v)=>b.add(v,b.constant((2**v.length)-1,v.length)).sum;
const inc=(b,v)=>b.add(v,b.constant(1,v.length)).sum;
const rotate=v=>[v.at(-1),...v.slice(0,-1)];

/** Port-connected, clocked research devices. Countdown logic, flags, buffers,
 * splay and handshakes are gates. Tape is immutable external media in a ROM
 * macro; debug trace rings are observation storage, not original TX-2 cards.
 * Periods are logical-clock counts, explicitly NOT calibrated microseconds. */
export function inoutCircuit(b, p, {tapeFrames=new Uint8Array(),readerPeriod=128,rewindPeriod=4,scopePeriod=4,punchPeriod=32,traceDepth=256}={}) {
    bounded(readerPeriod,1,65535,'reader period');bounded(rewindPeriod,1,65535,'rewind period');
    bounded(scopePeriod,1,8191,'scope period');bounded(punchPeriod,1,65535,'punch period');
    bounded(traceDepth,1,4096,'trace depth');if((traceDepth&(traceDepth-1))!==0)throw new RangeError('Trace depth must be a power of two');
    if(!(tapeFrames instanceof Uint8Array)||tapeFrames.length>131072)
        throw new RangeError('Tape accepts at most 131072 binary data frames');
    const {K,flags,unit,arg,config,cf,word,commit,clockEnable,referenceEnable,references,markingDisabled}=p;
    const opr=p.is.OPR,tsd=p.is.TSD,zero36=b.constant(0,36),zero12=b.constant(0,12);
    const reportCommand=b.eqConstant(arg,0),disconnectCommand=b.eqConstant(arg,0o20000),connectCommand=b.eqConstant(arg.slice(12),3),
        lowerCommand=b.eqConstant(arg,0o40000),raiseCommand=b.eqConstant(arg,0o50000);
    const mode=arg.slice(0,12),validUnit=b.or(b.eqConstant(unit,0),unit[5]);
    const clock=b.register('deviceClock',32);clock.connect(inc(b,clock.q),clockEnable);
    const devices=new Map(),events=Array(64).fill(b.zero),initialMemories=new Map();
    const selects=new Map(INOUT_UNITS.map(n=>[n,b.eqConstant(unit,n)]));
    function device(n){
        const prefix=`io${n.toString(8)}`,c=b.register(prefix+'.connected',1),m=b.register(prefix+'.mode',12),r=b.register(prefix+'.ready',1),miss=b.register(prefix+'.missed',1);
        const selected=selects.get(n),connect=b.all([commit,opr,selected,connectCommand]),disconnect=b.all([commit,opr,selected,disconnectCommand]);
        const addressed=b.eqConstant(K,n),attempt=b.and(tsd,addressed),transfer=b.all([commit,attempt,c.q[0],r.q[0]]);
        const d={prefix,c,m,r,miss,selected,connect,disconnect,addressed,attempt,transfer};devices.set(n,d);return d;
    }
    const trap=device(0o42),reader=device(0o52),pen=device(0o55),scope=device(0o60),punch=device(0o63);
    for(const d of devices.values()){
        const reset=d===trap?b.zero:d.disconnect;
        d.c.connect([b.mux(d.c.q[0],b.not(reset),b.or(d.connect,reset))],clockEnable);
        d.m.connect(mode,d.connect);
    }
    // TRAP mode survives disconnect. Marking/interrupt requests observe OLD meta.
    const phaseTrap=b.any([b.and(references.fetch,trap.m.q[0]),b.and(references.defer,trap.m.q[1]),b.and(references.operand,trap.m.q[2])]);
    const mark=b.and(b.not(markingDisabled),b.any([b.and(references.fetch,trap.m.q[6]),b.and(references.defer,trap.m.q[7]),b.and(references.operand,trap.m.q[8])]));
    events[0o42]=b.all([referenceEnable,references.meta,phaseTrap]);
    trap.r.connect([b.zero]);trap.miss.connect([b.zero]);pen.r.connect([b.zero]);pen.miss.connect([b.zero]);

    // Reader buffer and a genuine clocked rewind. The file boundary is the
    // logical beginning-of-tape; no END MARK hole pattern is fabricated.
    const position=b.register('tapePosition',18),buffer=b.register('tapeBuffer',6),timer=b.register('tapeCountdown',16),reverse=b.register('tapeRewinding',1);
    const available=b.not(ge(b,position.q,tapeFrames.length)),elapsed=b.not(b.any(timer.q));
    const transport=b.all([reader.c.q[0],b.not(reader.connect),b.not(reader.disconnect),clockEnable]);
    const arrive=b.all([transport,elapsed,b.not(reverse.q[0]),available]);
    const rewind=b.all([transport,elapsed,reverse.q[0]]),atBeginning=b.not(b.any(position.q));
    const reversal=b.and(rewind,atBeginning),rewindStep=b.and(rewind,b.not(atBeginning));
    const tapeDepth=Math.max(1,tapeFrames.length);
    const tape=b.ram('TAPE_ROM',{width:6,depth:tapeDepth,address:position.q.slice(0,17),data:b.constant(0,6),write:b.zero,readonly:[[0,tapeDepth-1]]});
    initialMemories.set('TAPE_ROM',new Map(Array.from(tapeFrames,(v,i)=>[i,BigInt(v&63)])));
    position.connect(b.select(inc(b,position.q),dec(b,position.q),rewindStep),b.or(arrive,rewindStep));
    reverse.connect([b.mux(b.and(reverse.q[0],b.not(b.or(reversal,reader.disconnect))),mode[2],reader.connect)],clockEnable);
    const reload=b.select(b.constant(readerPeriod-1,16),b.constant(rewindPeriod-1,16),b.or(b.and(reader.connect,mode[2]),rewindStep));
    let nextTimer=b.select(timer.q,dec(b,timer.q),b.and(transport,b.not(elapsed)));
    nextTimer=b.select(nextTimer,reload,b.or(reader.connect,b.or(arrive,rewind)));
    nextTimer=b.select(nextTimer,b.constant(0,16),reader.disconnect);timer.connect(nextTimer,clockEnable);
    buffer.connect(tape,arrive);
    const consumed=reader.transfer;
    reader.r.connect([b.and(b.or(b.and(reader.r.q[0],b.not(consumed)),arrive),b.not(b.or(reader.connect,reader.disconnect)))],clockEnable);
    reader.miss.connect([b.and(b.or(reader.miss.q[0],b.all([arrive,reader.r.q[0],b.not(consumed)])),b.not(reader.connect))],clockEnable);
    events[0o52]=arrive;
    const splayed=word.map((_pin,i)=>i%6===0?buffer.q[i/6]:word[i-1]);
    const readerWord=b.select([...buffer.q,...word.slice(6)],splayed,reader.m.q[1]);

    function outputDevice(d,period){
        const timer=b.register(d.prefix+'.countdown',16),fresh=b.and(d.connect,b.not(d.c.q[0]));
        const ready=b.all([d.c.q[0],b.not(d.r.q[0]),b.not(b.any(timer.q)),b.not(d.disconnect),b.not(d.transfer),clockEnable]);
        let next=b.select(timer.q,dec(b,timer.q),b.and(d.c.q[0],b.any(timer.q)));
        next=b.select(next,dec(b,period),d.transfer);next=b.select(next,b.constant(0,16),b.or(d.disconnect,fresh));
        timer.connect(next,clockEnable);
        d.r.connect([b.and(b.or(b.and(d.r.q[0],b.not(d.transfer)),b.or(ready,fresh)),b.not(d.disconnect))],clockEnable);
        d.miss.connect([b.zero]);events[Number.parseInt(d.prefix.slice(2),8)]=b.or(ready,fresh);
    }
    const dwell=muxWords(b,Array.from({length:4},(_,i)=>b.constant(scopePeriod*2**i,16)),scope.m.q.slice(3,5));
    outputDevice(scope,dwell);outputDevice(punch,b.constant(punchPeriod,16));
    const scopeX=[...word.slice(26,35),b.xor(word[35],scope.m.q[7])],scopeY=[...word.slice(8,17),b.xor(word[17],scope.m.q[6])];
    const lastX=b.register('scopeX',10),lastY=b.register('scopeY',10),lastMode=b.register('scopeMode',12);
    lastX.connect(scopeX,scope.transfer);lastY.connect(scopeY,scope.transfer);lastMode.connect(scope.m.q,scope.transfer);
    function trace(name,data,event){
        const count=b.register(name+'Count',32);count.connect(inc(b,count.q),event);
        const address=traceDepth===1?b.constant(0,1):count.q.slice(0,Math.log2(traceDepth));
        b.ram(name+'_TRACE',{width:data.length,depth:traceDepth,address,data,write:event});
        b.output(name+'Count',count.q);return count.q;
    }
    // 72-bit observation words: raw scope word, 12 mode bits, low 24 clock bits.
    trace('scope',[...word,...scope.m.q,...clock.q.slice(0,24)],scope.transfer);
    const punchData=b.select(word.slice(0,6),Array.from({length:6},(_,i)=>word[5+i*6]),punch.m.q[1]);
    const punched=[...punchData,punch.m.q[2]],lastPunch=b.register('punchFrame',7);lastPunch.connect(punched,punch.transfer);
    trace('punch',[...punched,...clock.q],punch.transfer);
    const punchWord=b.select(word,rotate(word),punch.m.q[1]);

    // Circular optical aperture implemented with signed subtractors, squarers
    // and comparator gates. It is a digital geometric sensor, not photometry.
    const penX=b.input('penX',10),penY=b.input('penY',10),penRadius=b.input('penRadius',10,8n),penDown=b.input('penDown')[0];
    const squaredDistance=(left,right)=>{
        const diff=b.onesAdd([...left,left[9]],b.bits(Gate.NOT,[...right,right[9]])).sum;
        const magnitude=diff.slice(0,10).map(v=>b.xor(v,diff[10]));return multiplyCircuit(b,magnitude,magnitude);
    };
    const distance=b.add([...squaredDistance(scopeX,penX),b.zero],[...squaredDistance(scopeY,penY),b.zero]).sum;
    const radius=[...multiplyCircuit(b,penRadius,penRadius),b.zero];
    const inside=b.add(radius,b.bits(Gate.NOT,distance),b.one).carry;
    events[0o55]=b.all([scope.transfer,pen.c.q[0],penDown,inside]);
    const hits=b.register('penHits',32);hits.connect(inc(b,hits.q),events[0o55]);

    const connectedUnit=b.any(INOUT_UNITS.map(n=>selects.get(n)));
    const modeValid=b.any([
        b.and(trap.selected,b.not(b.any(mode.filter((_,i)=>!((0o717>>i)&1))))),
        b.and(reader.selected,b.any([0,2,0o100,0o102,0o104,0o106].map(v=>b.eqConstant(mode,v)))),
        b.and(pen.selected,b.not(b.any(mode))),
        b.and(scope.selected,b.not(b.any(mode.filter((_,i)=>!((0o330>>i)&1))))),
        b.and(punch.selected,b.not(b.any(mode.filter((_,i)=>!((6>>i)&1)))))
    ]);
    const validCommand=b.any([reportCommand,b.and(disconnectCommand,connectedUnit),b.and(connectCommand,modeValid),b.and(b.or(lowerCommand,raiseCommand),validUnit)]);
    const commandFault=b.and(opr,b.not(validCommand));
    const noIO=b.any([0,0o75,0o76].map(n=>b.eqConstant(K,n)));
    const buffered=b.or(reader.addressed,b.or(scope.addressed,punch.addressed));
    const isTrap=trap.addressed,tsdSupported=b.or(noIO,b.or(isTrap,buffered));
    const transferReady=b.any([noIO,isTrap,...[reader,scope,punch].map(d=>b.all([d.addressed,d.c.q[0],d.r.q[0]]))]);
    const assembly=b.any([...devices.values()].map(d=>b.and(d.addressed,d.m.q[1])));
    const transferFault=b.and(tsd,b.or(b.not(tsdSupported),b.all([b.not(noIO),b.not(assembly),b.any(cf)])));
    const retry=b.and(tsd,b.not(transferReady));
    const memoryWrite=b.and(tsd,b.any([noIO,isTrap,b.and(reader.addressed,transferReady),b.and(punch.addressed,transferReady)]));
    let transferWord=rotate(word);transferWord=b.select(transferWord,readerWord,reader.addressed);transferWord=b.select(transferWord,punchWord,punch.addressed);
    const eWrite=b.and(tsd,b.and(b.not(noIO),transferReady));
    const eWord=b.select(transferWord,word,scope.addressed);
    let reportMode=zero12,reportReady=b.zero,reportConnected=b.zero,reportMissed=b.zero;
    for(const d of devices.values()){
        reportMode=b.select(reportMode,d.m.q,d.selected);reportReady=b.mux(reportReady,d.r.q[0],d.selected);
        reportConnected=b.mux(reportConnected,d.c.q[0],d.selected);reportMissed=b.mux(reportMissed,d.miss.q[0],d.selected);
    }
    const flag=muxWords(b,flags.map(pin=>[pin]),unit)[0];
    const report=[...reportMode,reportMissed,b.zero,reportConnected,b.zero,reportReady,flag,...unit,...b.constant(0,12)];
    b.output('deviceClock',clock.q);b.output('tapePosition',position.q);b.output('tapeBuffer',buffer.q);b.output('tapeRewinding',reverse.q);
    b.output('tapeEOF',[b.not(available)]);b.output('scopeX',lastX.q);b.output('scopeY',lastY.q);b.output('scopeMode',lastMode.q);
    b.output('scopePulse',[scope.transfer]);b.output('punchFrame',lastPunch.q);b.output('penHits',hits.q);
    for(const [n,d]of devices){b.output(d.prefix+'.connected',d.c.q);b.output(d.prefix+'.mode',d.m.q);b.output(d.prefix+'.ready',d.r.q);b.output(d.prefix+'.missed',d.miss.q);}
    return {events,initialMemories,clock:clock.q,mode:trap.m.q,mark,commandFault,transferFault,retry,memoryWrite,transferWord,eWrite,eWord,report,
        reportEnable:b.and(opr,config[0]),lower:b.and(opr,lowerCommand),raise:b.and(opr,raiseCommand),traceDepth,
        dismiss:b.and(opr,config[4]),validFlagUnit:validUnit};
}
