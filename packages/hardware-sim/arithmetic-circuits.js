import { Gate } from './logic.js';
import { FRACTURES, muxWords } from './circuits.js';
export const EXTENDED_OPERATIONS=Object.freeze(['CYA','CYB','CAB','SCA','SCB','SAB','NOA','NAB','MUL','DIV','TLY']);
const invertSign=(b,v)=>[...v.slice(0,-1),b.not(v.at(-1))];
const scaleOne=(v,right)=>right?[...v.slice(1),v.at(-1)]:[v.at(-1),...v.slice(0,-2),v.at(-1)];
/** Log-depth barrel network. Wiring permutations are elaborated, never computed
 * from emulated integer operands on the host during execution. */
export function barrelCircuit(b,value,count,right,{cycle=false}={}){
    let v=value;const width=v.length;
    for(let bit=0;bit<count.length;bit++){
        const distance=2**bit;
        const left=Array.from({length:width},(_,i)=>cycle?v[(i-distance%width+width)%width]:i===width-1||i<distance?v.at(-1):v[i-distance]);
        const rv=Array.from({length:width},(_,i)=>cycle?v[(i+distance)%width]:v[Math.min(width-1,i+distance)]);
        v=b.select(v,b.select(left,rv,right),count[bit]);
    }return v;
}
/** Carry-save partial-product reduction, followed by a prefix carry adder. */
export function multiplyCircuit(b,a,c){
    const width=a.length+c.length;let rows=c.map((pin,i)=>Array.from({length:width},(_,k)=>k>=i&&k<i+a.length?b.and(pin,a[k-i]):b.zero));
    while(rows.length>2){const next=[];
        for(let i=0;i<rows.length;i+=3){if(i+2>=rows.length){next.push(...rows.slice(i));break;}
            const x=rows[i],y=rows[i+1],z=rows[i+2],sum=[],carry=[b.zero];
            for(let k=0;k<width;k++){
                const terms=[x[k],y[k],z[k]].filter(pin=>pin!==b.zero);
                if(!terms.length){sum.push(b.zero);carry.push(b.zero);}
                else if(terms.length===1){sum.push(terms[0]);carry.push(b.zero);}
                else{const p=b.xor(terms[0],terms[1]);sum.push(terms.length===2?p:b.xor(p,terms[2]));
                    carry.push(terms.length===2?b.and(terms[0],terms[1]):b.or(b.and(terms[0],terms[1]),b.and(p,terms[2])));}
            }next.push(sum,carry.slice(0,width));
        }rows=next;
    }return rows.length===1?rows[0]:b.add(rows[0],rows[1]).sum;
}
/** Unrolled restoring division. This is a structural combinational divider, not
 * a claim about the original machine's iterative circuitry or its cycle count. */
export function divideCircuit(b,numerator,denominator){
    const width=denominator.length+1,divisor=[...denominator,b.zero],negative=b.bits(Gate.NOT,divisor);
    let remainder=b.constant(0,width);const quotient=Array(numerator.length);
    for(let i=numerator.length-1;i>=0;i--){const candidate=[numerator[i],...remainder.slice(0,-1)];
        const trial=b.add(candidate,negative,b.one);quotient[i]=trial.carry;remainder=b.select(candidate,trial.sum,trial.carry);
    }return {quotient,remainder:remainder.slice(0,-1),zero:b.not(b.any(denominator))};
}
function population(b,pins){let words=pins.map(pin=>[pin,...b.constant(0,8)]);
    while(words.length>1){const next=[];for(let i=0;i<words.length;i+=2)next.push(i+1<words.length?b.add(words[i],words[i+1]).sum:words[i]);words=next;}return words[0];}
function normalize(b,initial,overflow){
    const width=initial.length;let count=b.constant(width-1,9);
    for(let i=0;i<width-1;i++)count=b.select(count,b.constant(width-2-i,9),b.xor(initial[i],initial.at(-1)));
    return {value:b.select(barrelCircuit(b,initial,count,b.zero),invertSign(b,scaleOne(initial,true)),overflow),
        steps:b.select(count,b.constant(510,9),overflow)};
}
/** Per-fracture arithmetic cards. Inputs to inactive MUL/DIV cards are isolated
 * so the event-driven backend does not recompute those networks for simple loads. */
export function extendedArithmeticCircuit(b,cfg,old,operand,loadedD,flags,is){
    const any=(...names)=>b.any(names.map(n=>is[n])),active=cfg.slice(3,7).map(p=>b.not(p)),faults=[];
    const enabled=any(...EXTENDED_OPERATIONS),double=any('CAB','SAB','NAB'),useB=any('CYB','SCB'),cycle=any('CYA','CYB','CAB');
    const shifting=any('CYA','CYB','CAB','SCA','SCB','SAB','NOA','NAB'),norm=any('NOA','NAB');
    const results=FRACTURES.map((groups,fracture)=>{
        const A=[...old.A],B=[...old.B],C=[...old.C],D=[...old.D],Z=[...flags];
        for(const group of groups){
            const lo=group[0]*9,width=group.length*9,q=group.at(-1),act=b.any(group.map(q=>active[q]));
            const selected=b.all([act,b.eqConstant(cfg.slice(7,9),fracture),enabled]);
            const isolate=(v,on)=>v.map(pin=>b.and(pin,on));
            const a=old.A.slice(lo,lo+width),bv=old.B.slice(lo,lo+width),d=operand.slice(lo,lo+width),ld=loadedD.slice(lo,lo+width);
            const count=ld.slice(-9),right=count[8],magnitude=count.slice(0,8).map(pin=>b.xor(pin,right));
            const scalePending=b.and(flags[q],b.not(useB));
            const first=initial=>{
                const step=b.select(scaleOne(initial,false),scaleOne(initial,true),right);
                const pending=b.and(scalePending,b.not(cycle));
                const start=b.select(initial,invertSign(b,step),pending);
                const rest=b.add(magnitude,b.select(b.constant(0,8),b.constant(255,8),pending)).sum;
                const scaled=barrelCircuit(b,start,rest,right);
                return b.select(scaled,barrelCircuit(b,initial,magnitude,right,{cycle:true}),cycle);
            };
            const shiftActive=b.and(selected,shifting),single=isolate(b.select(a,bv,useB),shiftActive),pair=isolate([...bv,...a],shiftActive);
            const ns=normalize(b,single,flags[q]),np=normalize(b,pair,flags[q]);
            const singleResult=b.select(first(single),ns.value,norm),doubleResult=b.select(first(pair),np.value,norm);
            const steps=b.select(ns.steps,np.steps,double);
            const newD=[...ld.slice(0,-9),...b.select(b.constant(511,9),b.onesAdd(count,b.bits(Gate.NOT,steps)).sum,norm)];
            const resultA=b.select(singleResult,doubleResult.slice(width),double),resultB=b.select(singleResult,doubleResult.slice(0,width),double);
            for(let bit=0;bit<width;bit++){
                A[lo+bit]=b.mux(A[lo+bit],resultA[bit],b.and(shifting,b.not(useB)));
                B[lo+bit]=b.mux(B[lo+bit],resultB[bit],b.and(shifting,b.or(useB,double)));
                D[lo+bit]=b.mux(D[lo+bit],newD[bit],shifting);
            }
            Z[q]=b.mux(Z[q],b.zero,b.all([shifting,b.not(cycle),b.not(useB)]));
            faults.push(b.all([selected,any('SCA','SAB'),flags[q],b.not(b.any(magnitude))]));
            const multiplying=b.and(selected,is.MUL),dividing=b.and(selected,is.DIV);
            const am=isolate(a.map(pin=>b.xor(pin,a.at(-1))),multiplying),dm=isolate(d.map(pin=>b.xor(pin,d.at(-1))),multiplying);
            const product=multiplyCircuit(b,am.slice(0,-1),dm.slice(0,-1));
            const sign=b.xor(a.at(-1),d.at(-1));
            const productWord=[b.zero,...product,b.zero].map(pin=>b.xor(pin,sign));
            const numerator=[...bv,...a].slice(1),numeratorMagnitude=isolate(numerator.map(pin=>b.xor(pin,a.at(-1))),dividing);
            const denominatorMagnitude=isolate(d.map(pin=>b.xor(pin,d.at(-1))),dividing);
            const divided=divideCircuit(b,numeratorMagnitude,denominatorMagnitude);
            const quotient=divided.quotient.slice(0,width).map(pin=>b.xor(pin,sign));
            const remainder=divided.remainder.map(pin=>b.xor(pin,a.at(-1)));
            faults.push(b.and(dividing,b.or(divided.zero,b.any(divided.quotient.slice(width)))));
            const md=any('MUL','DIV'),top=b.select(productWord.slice(width),quotient,is.DIV),bottom=b.select(productWord.slice(0,width),remainder,is.DIV);
            for(let bit=0;bit<width;bit++){
                A[lo+bit]=b.mux(A[lo+bit],top[bit],md);B[lo+bit]=b.mux(B[lo+bit],bottom[bit],md);
                C[lo+bit]=b.mux(C[lo+bit],b.zero,md);D[lo+bit]=b.mux(D[lo+bit],ld[bit],md);
                A[lo+bit]=b.mux(A[lo+bit],d[bit],is.TLY);
            }Z[q]=b.mux(Z[q],b.and(is.DIV,divided.quotient[width-1]),md);
            const tally=b.onesAdd(old.D.slice(q*9,q*9+9),population(b,isolate(d,b.and(selected,is.TLY)))).sum;
            for(let bit=0;bit<9;bit++)D[q*9+bit]=b.mux(D[q*9+bit],tally[bit],is.TLY);
            for(const [dest,original]of [[A,old.A],[B,old.B],[C,old.C],[D,old.D]])for(let bit=lo;bit<lo+width;bit++)dest[bit]=b.mux(original[bit],dest[bit],act);
            Z[q]=b.mux(flags[q],Z[q],act);
        }return [...A,...B,...C,...D,...Z];
    });
    const r=muxWords(b,results,cfg.slice(7,9));
    const coupled=b.all([b.eqConstant(cfg.slice(7,9),2),active[0],b.any(active.slice(1)),any('MUL','DIV','NOA','NAB','TLY')]);
    return {A:r.slice(0,36),B:r.slice(36,72),C:r.slice(72,108),D:r.slice(108,144),Z:r.slice(144),fault:b.or(coupled,b.any(faults)),enabled};
}
