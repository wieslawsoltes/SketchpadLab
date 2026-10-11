import { Gate } from './logic.js';
/** Balanced structural multiplexer. Selector and words are little-endian buses. */
export function muxWords(b, words, selector) {
    if (words.length !== 2 ** selector.length || !words.length || words.some(w => w.length !== words[0].length)) throw new Error('Invalid mux shape');
    let level = words;
    for (const bit of selector) { const next = []; for (let i = 0; i < level.length; i += 2) next.push(b.select(level[i],level[i+1],bit)); level = next; }
    return level[0];
}
export const FRACTURES = Object.freeze([[[0,1,2,3]],[[0,1],[2,3]],[[0],[1,2,3]],[[0],[1],[2],[3]]]);
const PERMUTATIONS = [[0,1,2,3],[1,2,3,0],[2,3,0,1],[3,0,1,2],[1,0,3,2],[3,2,1,0],[0,3,1,2],[0,2,3,1]];
/** Every one of the 512 configuration values is decoded from wires, not a host ALU. */
export function exchangeCircuit(b, cfg, memory, existing, { store = false, signExtend = true } = {}) {
    const activity = cfg.slice(3,7).map(pin => b.not(pin));
    if (store) return muxWords(b,PERMUTATIONS.map(p => Array.from({length:4},(_,q)=>{
        const from = p.indexOf(q); return b.select(existing.slice(q*9,q*9+9),memory.slice(from*9,from*9+9),activity[from]);
    }).flat()),cfg.slice(0,3));
    const permuted = muxWords(b,PERMUTATIONS.map(p => p.flatMap(q=>memory.slice(q*9,q*9+9))),cfg.slice(0,3));
    const loaded = activity.flatMap((active,q)=>b.select(existing.slice(q*9,q*9+9),permuted.slice(q*9,q*9+9),active));
    if (!signExtend) return loaded;
    return muxWords(b,FRACTURES.map(groups => {
        const result = [...loaded];
        for (const group of groups) for (let i=0;i<group.length;i++) {
            const q=group[i]; let fill=loaded.slice(q*9,q*9+9);
            // Nearest preceding active quarter supplies a cyclic, group-local sign.
            for (let distance=group.length-1;distance>=1;distance--) {
                const from=group[(i-distance+group.length)%group.length];
                fill=b.select(fill,Array(9).fill(permuted[from*9+8]),activity[from]);
            }
            result.splice(q*9,9,...b.select(fill,loaded.slice(q*9,q*9+9),activity[q]));
        } return result;
    }),cfg.slice(7,9));
}
export function arithmeticCircuit(b,cfg,a,operand,oldC,oldD,loadedD,oldFlags,subtract) {
    const activity=cfg.slice(3,7).map(p=>b.not(p));
    const words=FRACTURES.map(groups=>{
        const A=[...a],C=[...oldC],D=[...oldD],Z=[...oldFlags];
        for(const group of groups){
            const offset=group[0]*9,width=group.length*9,active=b.any(group.map(q=>activity[q]));
            const x=a.slice(offset,offset+width),y=operand.slice(offset,offset+width).map(pin=>b.xor(pin,subtract));
            const sum=b.onesAdd(x,y);
            A.splice(offset,width,...b.select(x,sum.sum,active));
            C.splice(offset,width,...b.select(oldC.slice(offset,offset+width),sum.carries,active));
            D.splice(offset,width,...b.select(oldD.slice(offset,offset+width),loadedD.slice(offset,offset+width),active));
            const signQuarter=group.at(-1);Z[signQuarter]=b.mux(Z[signQuarter],sum.overflow,active);
        }return [...A,...C,...D,...Z];
    });
    const r=muxWords(b,words,cfg.slice(7,9));return {A:r.slice(0,36),C:r.slice(36,72),D:r.slice(72,108),Z:r.slice(108)};
}
export function activeMaskCircuit(b,cfg,{quartersOnly=false}={}) {
    const activity=cfg.slice(3,7).map(p=>b.not(p));
    if(quartersOnly)return activity.flatMap(pin=>Array(9).fill(pin));
    return muxWords(b,FRACTURES.map(groups=>groups.flatMap(group=>Array(group.length*9).fill(b.any(group.map(q=>activity[q]))))),cfg.slice(7,9));
}
/** Explicit storage bank: each bit is a flip-flop; read mux and write decoders are
 * gates. Intentionally bounded to small research memories, not millions of cores. */
export function gateRam(b,{name,width,depth,address,data,write,initial=new Map()}) {
    if(!Number.isInteger(depth)||depth<1||depth>512||2**Math.ceil(Math.log2(depth))!==depth)throw new RangeError('Gate RAM depth must be a power of two, 1..512');
    const words=[];
    for(let i=0;i<depth;i++){
        const r=b.register(`${name}.${i}`,width,initial.get(i)??0n);
        r.connect(data,b.and(write,b.eqConstant(address,i)));words.push(r.q);
    }
    const n=Math.log2(depth),out=muxWords(b,words,address.slice(0,n));
    return address.length>n?b.select(out,b.constant(0,width),b.any(address.slice(n))):out;
}
/** Convert a one's-complement signed index to an ordinary modulo-17-bit offset. */
export function indexedAddressCircuit(b,address,index) {
    return b.add(address.slice(0,17),index.slice(0,17),index[17]).sum;
}
