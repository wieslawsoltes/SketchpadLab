import { Gate } from './logic.js';
import { muxWords } from './circuits.js';

export const SEQUENCE_UNITS = Object.freeze([0, ...Array.from({length:32}, (_,i)=>0o40+i)]);

/** Balanced priority tree: the first asserted input wins. Every selection is a
 * MUX/OR gate; this elaborator does not inspect runtime signal values. */
export function priorityCircuit(b, requests, payloads) {
    if (!requests.length || requests.length !== payloads.length ||
        payloads.some(p=>p.length !== payloads[0].length)) throw new Error('Invalid priority encoder shape');
    let nodes = requests.map((valid,i)=>({valid, value:payloads[i]}));
    while (nodes.length > 1) {
        const next=[];
        for (let i=0;i<nodes.length;i+=2) {
            const left=nodes[i],right=nodes[i+1];
            next.push(!right ? left : {valid:b.or(left.valid,right.valid),value:b.select(right.value,left.value,left.valid)});
        }
        nodes=next;
    }
    return nodes[0];
}

/** Allocate separately so opcode/I/O logic can read K and flags before the
 * controller's next-state equations are connected. Logical clock boundaries,
 * not a transcription of historical sequence-control cards. */
export function sequenceRegisters(b, entry, {initialFlags=1n}={}) {
    const permitted = SEQUENCE_UNITS.reduce((v,n)=>v|(1n<<BigInt(n)),0n);
    if (typeof initialFlags!=='bigint' || initialFlags<0n || (initialFlags&~permitted))
        throw new RangeError('Sequence flags are only 0 and 40..77 octal');
    const compact = SEQUENCE_UNITS.reduce((v,n,i)=>v|((initialFlags>>BigInt(n)&1n)<<BigInt(i)),0n);
    const K=b.register('K',6),F=b.register('sequenceFlags',33,compact),H=b.register('previousHold',1),
        D=b.register('dismissed',1),L=b.register('limbo',1);
    const flags=Array(64).fill(b.zero);SEQUENCE_UNITS.forEach((unit,i)=>flags[unit]=F.q[i]);
    const tsp=b.constant(entry,18);
    let connected=false;
    return {K:K.q,flags,held:H.q[0],dismissed:D.q[0],limbo:L.q[0],tsp,
        connect({boundary,running,commit,hold,dismiss,raise,lower,unit,events,p,placekeepers,trapMode}) {
            if(connected)throw new Error('Sequence controller is already connected');connected=true;
            if(events.length!==64||placekeepers.length!==64)throw new Error('Sequence controller requires 64 flag/keeper slots');
            const all=b.or(D.q[0],L.q[0]),allowed=b.or(all,b.not(H.q[0]));
            const pending=SEQUENCE_UNITS.map(n=>b.or(flags[n],events[n]));
            const eligible=SEQUENCE_UNITS.map((n,i)=> {
                const atLeastK=b.add(b.constant(n,6),b.bits(Gate.NOT,K.q),b.one).carry;
                return b.and(pending[i],b.or(all,b.not(atLeastK)));
            });
            const chosen=priorityCircuit(b,eligible,SEQUENCE_UNITS.map(n=>b.constant(n,6)));
            const change=b.all([boundary,running,allowed,chosen.valid,b.not(b.eq(chosen.value,K.q))]);
            const keepers=placekeepers.map((q,i)=>i===0?tsp:q);
            const candidateP=muxWords(b,keepers,chosen.value);
            const candidateAboveTrap=b.add(chosen.value,b.constant(64-0o43,6)).carry;
            const intercepted=b.all([change,trapMode[3],b.not(b.eqConstant(K.q,0o42)),candidateAboveTrap,candidateP[17]]);
            const target=b.select(chosen.value,b.constant(0o42,6),intercepted);
            const targetP=muxWords(b,keepers,target);
            const sleeping=b.all([allowed,all,b.not(chosen.valid)]);
            const effectiveDismiss=b.and(dismiss,b.not(b.and(raise,b.eq(unit,K.q))));
            const nextFlags=SEQUENCE_UNITS.map((n,i)=> {
                const cleared=b.and(commit,b.or(b.and(lower,b.eqConstant(unit,n)),b.and(dismiss,b.eqConstant(K.q,n))));
                const raised=b.and(commit,b.and(raise,b.eqConstant(unit,n)));
                return b.any([b.and(F.q[i],b.not(cleared)),raised,events[n],n===0o42?intercepted:b.zero]);
            });
            F.connect(nextFlags,running);K.connect(target,change);
            H.connect([b.and(hold,b.not(effectiveDismiss))],commit);D.connect([effectiveDismiss],commit);
            L.connect([sleeping],b.and(boundary,running));
            // E: old K in quarter 4, intended candidate in quarter 3, old P in R(E).
            const report=[...p,...chosen.value,...b.constant(0,3),...K.q,...b.constant(0,3)];
            b.output('K',K.q);b.output('flags',flags);b.output('previousHold',H.q);
            b.output('dismissed',D.q);b.output('limbo',L.q);b.output('TSP',tsp);
            b.output('sequenceChange',[change]);b.output('sequenceTarget',target);
            b.output('sequenceTrap',[intercepted]);
            return {change,target,targetP,report,sleeping,intercepted,
                validUnit:b.or(b.eqConstant(unit,0),unit[5]),
                validK:b.or(b.eqConstant(K.q,0),K.q[5])};
        }
    };
}
