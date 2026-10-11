import { NetlistBuilder } from './netlist.js';
import { DigitalSimulator } from './digital.js';
import { Gate } from './logic.js';
import { muxWords, exchangeCircuit, arithmeticCircuit, activeMaskCircuit, indexedAddressCircuit, gateRam, FRACTURES } from './circuits.js';
import { OPCODES } from '../tx2-core/instruction.js';
import { EXTENDED_OPERATIONS, extendedArithmeticCircuit } from './arithmetic-circuits.js';
import { STANDARD_CONFIGURATION } from '../tx2-core/standard-config.js';
export const COMPACT_OPERATIONS=Object.freeze(['LDA','LDB','LDC','LDD','LDE','STA','STB','STC','STD','STE','RSX','AUX','DPX','EXX','ADX','SKX',
    'JMP','JPX','JNX','JPA','JNA','JOV','SPF','SPG','FLF','FLG','ADD','SUB','ITE','ITA','UNA','DSA','SED','EXA','INS','COM','SKM']);
export const BOARD_OPERATIONS=Object.freeze([...COMPACT_OPERATIONS,...EXTENDED_OPERATIONS]);
/** A synthesized research board, NOT a transcription of historical circuit cards.
 * Execution has no call to TX2.execute/step or arithmetic interpreter. Instruction
 * decode, fetch/defer/execute sequencing, register writes and ALU are netlist gates.
 * The default RAM macro is an explicit abstraction; optional small RAM uses flops. */
export function buildTX2Board(image,{memory='macro',depth=131072,extended=false}={}) {
    if(!['macro','gates'].includes(memory)||!Number.isInteger(depth)||depth<1||depth>131072||(memory==='gates'&&depth>512))throw new Error('Invalid board memory');
    if(!image||image.diagnostics?.some(d=>d.severity!=='warning')||!Array.isArray(image.words)||image.words.length>131072)throw new Error('Invalid assembly image');
    const initial=new Map();const addresses=[0o377604,0o377605,0o377606,0o377607,0o377610];
    for(const pair of image.words){
        if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||pair[0]<0||pair[0]>=depth||typeof pair[1]!=='bigint'||pair[1]<0n||pair[1]>=1n<<36n||initial.has(pair[0]))throw new Error('Image does not fit board memory or overlaps');
        initial.set(...pair);
    }
    const entry=image.entry??image.words[0]?.[0]??0;if(!Number.isInteger(entry)||entry<0||entry>=depth)throw new Error('Invalid board entry');
    const b=new NetlistBuilder('TX-2 structural research board'),zero36=b.constant(0,36),zero18=b.constant(0,18);
    const phase=b.register('phase',2),P=b.register('P',18,BigInt(entry)),N=b.register('N',36),EA=b.register('EA',18),Q=b.register('Q',18);
    const regs=Object.fromEntries('ABCDE'.split('').map(name=>[name,b.register(name,36,initial.get(addresses['ABCDE'.indexOf(name)])??0n)]));
    const X=Array.from({length:64},(_,i)=>i?b.register(`X${i}`,18):{q:zero18});
    const F=Array.from({length:32},(_,i)=>i?b.register(`F${i}`,9,BigInt(STANDARD_CONFIGURATION[i])):{q:b.constant(0,9)});
    const Z=b.register('Z',4),halt=b.register('halt',1),retired=b.register('retired',32),deferCount=b.register('deferCount',13),registerMeta=b.register('registerMeta',1);
    const fetch=b.eqConstant(phase.q,0),resolve=b.eqConstant(phase.q,1),execute=b.eqConstant(phase.q,2),running=b.not(halt.q[0]);
    const op=N.q.slice(24,30),config=N.q.slice(30,35),j=N.q.slice(18,24),arg=N.q.slice(0,18);
    const is=Object.fromEntries((extended?BOARD_OPERATIONS:COMPACT_OPERATIONS).map(name=>[name,b.eqConstant(op,OPCODES[name])]));
    const any=(...names)=>b.any(names.map(name=>is[name]));
    const x=muxWords(b,X.map(r=>r.q),j),cf=muxWords(b,F.map(r=>r.q),config);
    const direct=b.or(is.SKX,is.JMP),deferred=b.and(EA.q[17],b.not(direct));
    const notIndexed=any('RSX','AUX','DPX','EXX','ADX','JPX','JNX','SKM','SKX');
    const useIndex=b.and(b.not(notIndexed),b.or(b.not(is.JMP),config[0]));
    const finalAddress=indexedAddressCircuit(b,EA.q,b.select(zero18,x,useIndex));
    const memAddress=b.select(EA.q.slice(0,17),P.q.slice(0,17),fetch);
    const registerSelect=addresses.map(a=>b.eqConstant(memAddress,a)),atRegister=b.any(registerSelect);
    const writePins=Array.from({length:36},()=>b.wire()),writePin=b.wire(),metaWritePin=b.wire(),metaValuePin=b.wire();
    const isCore=b.not(b.add(memAddress,b.constant((1<<17)-0o220000,17)).carry);
    const isROM=b.all(memAddress.slice(5));
    const inDepth=depth===131072?b.one:b.not(b.add(memAddress,b.constant((1<<17)-depth,17)).carry);
    const mapped=b.or(atRegister,b.and(inDepth,b.or(isCore,isROM)));
    const dataWrite=b.all([writePin,b.not(atRegister),b.not(isROM)]),metaWrite=b.all([metaWritePin,b.not(atRegister),b.not(isROM)]);
    const ramArgs={name:'STUV',width:36,depth,address:memAddress,data:writePins,write:dataWrite,initial};
    const metaArgs={name:'META',width:1,depth,address:memAddress,data:[metaValuePin],write:metaWrite};
    const read=memory==='gates'?gateRam(b,ramArgs):b.ram('STUV',ramArgs);
    const metaRead=memory==='gates'?gateRam(b,metaArgs):b.ram('META',metaArgs);
    let m=read;for(let i=0;i<5;i++)m=b.select(m,regs['ABCDE'[i]].q,registerSelect[i]);
    const meta=b.mux(metaRead[0],registerMeta.q[0],atRegister);
    const pointerX=muxWords(b,X.map(r=>r.q),m.slice(18,24));
    const pointerAddress=[...indexedAddressCircuit(b,m,pointerX),m[17]];
    const validOperation=b.any(Object.values(is));
    const unsupportedControl=b.any([b.and(is.JMP,b.or(arg[17],config[4])),b.and(is.SKX,b.or(config[3],config[4])),b.and(any('JPX','JNX'),b.not(N.q[35]))]);
    const deferLimit=b.and(resolve,b.and(deferred,b.eqConstant(deferCount.q,4096)));
    // A non-deferred RESOLVE computes the indexed target without reading RAM.
    // Only pointer-chasing reads the raw EA during this phase.
    const memoryNeeded=b.or(fetch,b.or(b.and(resolve,deferred),b.and(execute,b.not(direct))));
    const arithmeticFault=b.wire('arithmeticFault');
    const fault=b.or(arithmeticFault,b.or(b.and(execute,b.or(b.not(validOperation),unsupportedControl)),b.or(deferLimit,b.and(memoryNeeded,b.not(mapped)))));
    const active=b.and(running,b.not(fault)),commit=b.and(execute,active);
    const fetchNow=b.and(fetch,active),resolveNow=b.and(resolve,active);
    const normalResolve=b.and(resolveNow,b.not(deferred)),pointerResolve=b.and(resolveNow,deferred);
    const align=exchangeCircuit(b,cf,m,zero36),alignNoSign=exchangeCircuit(b,cf,m,zero36,{signExtend:false});
    const old=Object.fromEntries('ABCDE'.split('').map(n=>[n,regs[n].q]));
    const loaded=Object.fromEntries('ABCDE'.split('').map(n=>[n,exchangeCircuit(b,cf,m,old[n])]));
    const mask=activeMaskCircuit(b,cf),maskQuarters=activeMaskCircuit(b,cf,{quartersOnly:true});
    const arithmetic=arithmeticCircuit(b,cf,old.A,align,old.C,old.D,loaded.D,Z.q,is.SUB);
    const extra=extended?extendedArithmeticCircuit(b,cf,old,align,loaded.D,Z.q,is):null;
    b.drive(arithmeticFault,Gate.BUF,extra?b.and(execute,extra.fault):b.zero);
    const positive=bus=>b.and(b.not(bus.at(-1)),b.any(bus)),negative=bus=>b.and(bus.at(-1),b.not(b.all(bus))),isZero=bus=>b.or(b.not(b.any(bus)),b.all(bus));
    const nextX=Object.fromEntries(['RSX','EXX'].map(n=>[n,exchangeCircuit(b,cf,m,[...x,...zero18]).slice(0,18)]));
    const xSum=b.onesAdd(x,align.slice(0,18)).sum,xExtended=[...x,...Array(18).fill(x[17])];
    const indexIncrement=[...config,...Array(13).fill(config[4])];
    const incrementedX=b.onesAdd(x,indexIncrement).sum;
    const immediateSum=b.onesAdd(x,arg),immediateDifference=b.onesAdd(x,b.bits(Gate.NOT,arg));
    const same=(a,c)=>b.or(b.eq(a,c),b.and(isZero(a),isZero(c)));
    const negArg=b.bits(Gate.NOT,arg),mode=config.slice(0,3),modes=Array.from({length:8},(_,n)=>b.eqConstant(mode,n));
    const skxValues=[arg,negArg,immediateSum.sum,immediateDifference.sum,b.select(x,b.constant(0o777777,18),b.eqConstant(x,0)),b.select(x,zero18,b.eqConstant(x,0o777777)),x,b.select(x,zero18,b.eqConstant(x,0o777777))];
    const skxSkip=b.any([b.and(modes[4],b.not(same(x,arg))),b.and(modes[5],b.not(same(x,negArg))),
        b.all([modes[6],b.not(immediateDifference.overflow),negative(immediateDifference.sum)]),b.all([modes[7],b.not(immediateSum.overflow),positive(immediateSum.sum)])]);
    const groupTests=FRACTURES.map(groups=>{
        const activity=cf.slice(3,7).map(p=>b.not(p));
        return [b.any(groups.map(g=>b.and(b.any(g.map(q=>activity[q])),positive(old.A.slice(g[0]*9,(g.at(-1)+1)*9))))),
            b.any(groups.map(g=>b.and(b.any(g.map(q=>activity[q])),negative(old.A.slice(g[0]*9,(g.at(-1)+1)*9))))),
            b.any(groups.map(g=>b.and(b.any(g.map(q=>activity[q])),Z.q[g.at(-1)])))];
    });
    const tests=muxWords(b,groupTests,cf.slice(7,9));
    const indexJump=b.or(b.and(is.JPX,positive(x)),b.and(is.JNX,negative(x)));
    const takeJump=b.any([is.JMP,indexJump,b.and(is.JPA,tests[0]),b.and(is.JNA,tests[1]),b.and(is.JOV,tests[2])]);
    // Bit selection, metadata and parity are circuits as well as the arithmetic path.
    const bitSelect=Array.from({length:36},(_,bit)=>b.eqConstant(j,(((Math.floor(bit/9)+1)%4)<<4)|(bit%9+1)));
    const bitNumber=j.slice(0,4),isMeta=b.eqConstant(bitNumber,10),isParity=b.or(b.eqConstant(bitNumber,11),b.eqConstant(bitNumber,12));
    const bitExists=b.or(b.any(bitSelect),b.or(isMeta,isParity));
    const bitPrevious=b.any([b.any(m.map((pin,i)=>b.and(pin,bitSelect[i]))),b.and(isMeta,meta),b.and(isParity,b.reduce(m,Gate.XOR,b.zero))]);
    const changedBit=muxWords(b,[[bitPrevious],[b.not(bitPrevious)],[b.zero],[b.one]],config.slice(0,2))[0];
    const skmUnrotated=m.map((pin,i)=>b.mux(pin,changedBit,bitSelect[i]));
    const skmWord=b.select(skmUnrotated,[skmUnrotated.at(-1),...skmUnrotated.slice(0,-1)],config[2]);
    const skmCondition=muxWords(b,[[b.zero],[b.one],[b.and(bitExists,b.not(bitPrevious))],[b.and(bitExists,bitPrevious)]],config.slice(3,5))[0];
    const skip=b.any([b.and(is.SKX,skxSkip),b.and(is.SED,b.not(b.eq(exchangeCircuit(b,cf,m,old.E,{signExtend:false}),old.E))),b.and(is.SKM,skmCondition)]);
    const conditionalReturn=[...P.q,...old.E.slice(18)];
    const jmpE=[...b.select(old.E.slice(0,18),P.q,config[2]),...b.select(old.E.slice(18),Q.q,config[3])];
    let storeSource=zero36;for(const n of 'ABCDE')storeSource=b.select(storeSource,old[n],is['ST'+n]);
    storeSource=b.select(storeSource,old.A,is.EXA);storeSource=b.select(storeSource,xExtended,any('DPX','EXX'));
    storeSource=b.select(storeSource,[...xSum,...Array(18).fill(xSum[17])],is.ADX);
    const insert=old.A.map((a,i)=>b.mux(alignNoSign[i],a,old.B[i]));storeSource=b.select(storeSource,insert,is.INS);
    let store=exchangeCircuit(b,cf,storeSource,m,{store:true});
    const fNext=Array.from({length:4},(_,q)=>muxWords(b,F.map(r=>r.q),b.add(config,b.constant(q,5)).sum));
    store=b.select(store,[...fNext[0],...m.slice(9)],is.FLF);store=b.select(store,fNext.flat(),is.FLG);
    const fullPermuted=exchangeCircuit(b,[...cf.slice(0,3),...b.constant(0,6)],m,zero36,{signExtend:false});
    const complement=fullPermuted.map((pin,i)=>b.xor(pin,mask[i]));
    // Permutation zero after initial permutation; sign extension still honors fracture/activity.
    const com=exchangeCircuit(b,[...b.constant(0,3),...cf.slice(3)],complement,complement);
    store=b.select(store,com,is.COM);store=b.select(store,skmWord,is.SKM);
    const writes=any('STA','STB','STC','STD','STE','EXA','EXX','ADX','DPX','INS','COM','FLF','FLG','SKM');
    const writing=b.and(commit,writes);
    store.forEach((pin,i)=>b.drive(writePins[i],Gate.BUF,pin));b.drive(writePin,Gate.BUF,writing);
    const writingMeta=b.all([commit,is.SKM,isMeta,b.or(config[0],config[1])]);
    b.drive(metaWritePin,Gate.BUF,writingMeta);b.drive(metaValuePin,Gate.BUF,changedBit);
    registerMeta.connect([changedBit],b.and(writingMeta,atRegister));
    const nextRegs={...old};
    for(const n of 'ABCDE')nextRegs[n]=b.select(old[n],loaded[n],is['LD'+n]);
    nextRegs.A=b.select(nextRegs.A,loaded.A,b.and(is.EXA,b.not(registerSelect[0])));
    for(const n of ['A','C','D'])nextRegs[n]=b.select(nextRegs[n],arithmetic[n],any('ADD','SUB'));
    if(extra)for(const n of 'ABCD')nextRegs[n]=b.select(nextRegs[n],extra[n],extra.enabled);
    const logicResult=old.A.map((pin,i)=>b.mux(pin,b.or(b.and(is.ITA,b.and(pin,align[i])),b.or(b.and(is.UNA,b.or(pin,align[i])),b.and(is.DSA,b.xor(pin,align[i])))),mask[i]));
    nextRegs.A=b.select(nextRegs.A,logicResult,any('ITA','UNA','DSA'));
    nextRegs.C=b.select(nextRegs.C,old.C.map((pin,i)=>b.or(pin,b.all([old.A[i],align[i],mask[i]]))),is.DSA);
    nextRegs.D=b.select(nextRegs.D,loaded.D,is.DSA);
    // Memory-mapped register writes precede the instruction's E-register effects.
    for(let i=0;i<5;i++){const n='ABCDE'[i];nextRegs[n]=b.select(nextRegs[n],store,b.and(writes,registerSelect[i]));}
    const rawToE=any('LDA','LDB','LDC','LDD','RSX','AUX','SPF','SPG','ADD','SUB','ITA','UNA','DSA');
    nextRegs.E=b.select(nextRegs.E,m,extra?b.or(rawToE,extra.enabled):rawToE);
    nextRegs.E=b.select(nextRegs.E,store,b.and(writes,b.not(b.or(is.STE,is.SKM))));
    nextRegs.E=b.select(nextRegs.E,old.E.map((pin,i)=>b.mux(pin,b.and(pin,alignNoSign[i]),maskQuarters[i])),is.ITE);
    nextRegs.E=b.select(nextRegs.E,conditionalReturn,b.and(takeJump,b.not(is.JMP)));
    nextRegs.E=b.select(nextRegs.E,jmpE,is.JMP);
    for(const n of 'ABCDE')regs[n].connect(nextRegs[n],commit);
    let xValue=x;for(const [name,value]of Object.entries({...nextX,AUX:xSum,SKX:muxWords(b,skxValues,mode),JPX:incrementedX,JNX:incrementedX}))xValue=b.select(xValue,value,is[name]);
    xValue=b.select(xValue,P.q,b.and(is.JMP,config[1]));
    for(let i=1;i<64;i++)X[i].connect(xValue,b.and(commit,b.eqConstant(j,i)));
    for(let i=1;i<32;i++){
        let value=F[i].q,enable=b.zero;
        for(let q=0;q<4;q++){
            const selected=b.and(q?is.SPG:any('SPF','SPG'),b.eqConstant(config,(i-q+32)%32));
            value=b.select(value,m.slice(q*9,q*9+9),selected);enable=b.or(enable,selected);
        }F[i].connect(value,b.and(commit,enable));
    }
    Z.connect(extra?b.select(arithmetic.Z,extra.Z,extra.enabled):arithmetic.Z,b.and(commit,extra?b.or(any('ADD','SUB'),extra.enabled):any('ADD','SUB')));
    const nextP=[...b.add(P.q.slice(0,17),b.constant(1,17)).sum,P.q[17]];
    const target=[...EA.q.slice(0,17),P.q[17]],jumpP=b.select(nextP,target,takeJump);
    P.connect(b.select(b.select(P.q,nextP,fetch),b.select(P.q,jumpP,b.or(takeJump,skip)),execute),active);
    N.connect(b.select([...pointerAddress,...N.q.slice(18)],m,fetch),b.or(fetchNow,pointerResolve));
    // FETCH latches the operand from the current memory word, never the old N.
    EA.connect(b.select(b.select([...finalAddress,b.zero],pointerAddress,deferred),m.slice(0,18),fetch),b.or(fetchNow,resolveNow));
    Q.connect([...finalAddress,b.zero],b.and(normalResolve,b.not(direct)));
    phase.connect(b.select(b.select(b.constant(1,2),b.constant(2,2),b.and(resolve,b.not(deferred))),b.constant(0,2),execute),active);
    halt.connect([b.one],b.and(running,fault));
    retired.connect(b.add(retired.q,b.constant(1,32)).sum,commit);
    deferCount.connect(b.select(b.add(deferCount.q,b.constant(1,13)).sum,b.constant(0,13),fetch),b.or(fetchNow,pointerResolve));
    for(const [name,r]of Object.entries({P,N,Q,EA,phase,halt,retired,Z,...regs}))b.output(name,r.q);
    for(let i=0;i<64;i++)b.output(`X${i}`,X[i].q);for(let i=0;i<32;i++)b.output(`F${i}`,F[i].q);
    b.output('memoryAddress',memAddress);b.output('memoryData',m);b.output('writeData',store);b.output('writeEnable',[writing]);b.output('fault',[fault]);
    b.output('faultCode',[b.not(validOperation),unsupportedControl,b.not(mapped),deferLimit,arithmeticFault]);
    return {plan:b.compile(),memory,depth,initial};
}
export class TX2GateBoard {
    constructor(image,options={}) {
        this.board=buildTX2Board(image,options);this.simulator=new DigitalSimulator(this.board.plan,options);
        if(this.board.memory==='macro'){
            const m=this.simulator.memory('STUV');for(const [address,value]of this.board.initial)for(let bit=0;bit<36;bit++)m.values[address*36+bit]=Number(value>>BigInt(bit)&1n);
            this.simulator.settle();
        }
    }
    state(){const s=this.simulator;return Object.fromEntries(['P','Q','N','EA','phase','halt','retired','A','B','C','D','E','Z','faultCode'].map(n=>[n,s.read(n)]));}
    stepInstruction(maxClocks=8198){
        if(!Number.isInteger(maxClocks)||maxClocks<1||maxClocks>100000)throw new RangeError('Invalid clock budget');
        const before=this.simulator.read('retired');let clocks=0;
        while(this.simulator.read('retired')===before&&!this.simulator.read('halt')&&clocks<maxClocks){this.simulator.clock();clocks++;}
        return {clocks,...this.state()};
    }
}
