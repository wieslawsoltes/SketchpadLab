/** One cooperating workgroup evaluates one complete circuit. Workgroup-wide
 * storage barriers therefore cover every writer and every dependent reader.
 * No barrier is used as if it synchronized different workgroups. The loop bounds
 * containing barriers are constants/uniforms, and stop decisions are broadcast
 * with workgroupUniformLoad before changing uniform control flow.
 * Reference: https://www.w3.org/TR/WGSL/#synchronization-builtin-functions */
export function residentShader(l) {
    const constant = (name, n) => `const ${name}:u32=${n}u;`;
    const constants = Object.entries({ GATES:l.gates, LEVELS:l.levels, LEVEL_COUNT:l.schedule.levels.length, READ_BOUNDARY:l.schedule.readBoundary,
        FLOPS:l.flops, FLOP_COUNT:l.plan.flops.length, ROOTS:l.rootOffset, ROOT_COUNT:l.roots.length,
        MEMORIES:l.memories, MEMORY_COUNT:l.plan.memories.length, WIRES:l.wireWords,
        RECORDS:l.recordsOffset, RECORD_SIZE:l.recordWords, PROBES:l.probeOffset, PROBE_COUNT:l.probePins.length,
        SAMPLE:l.sampleOffset, HALT:l.ports.halt.offset, HALT_N:l.ports.halt.width,
        PC:l.ports.P.offset, PC_N:l.ports.P.width, PHASE:l.ports.phase.offset, PHASE_N:l.ports.phase.width,
        RETIRED:l.ports.retired.offset, RETIRED_N:l.ports.retired.width,
        LIMBO:l.ports.limbo.offset, LIMBO_N:l.ports.limbo.width }).map(([k,v])=>constant(k,v)).join('\n');
    return `${constants}
const NONE:u32=0xffffffffu;
struct Parameters { budget:u32, stopEnabled:u32, breakpoint:u32, instruction:u32, retired:u32, pad0:u32, pad1:u32, pad2:u32 }
struct Known { value:u32, valid:u32 }
@group(0) @binding(0) var<storage,read> plan:array<u32>;
@group(0) @binding(1) var<storage,read_write> wires:array<u32>;
@group(0) @binding(2) var<storage,read_write> ram:array<u32>;
@group(0) @binding(3) var<storage,read_write> result:array<u32>;
@group(0) @binding(4) var<storage,read> truth:array<u32>;
@group(0) @binding(5) var<uniform> params:Parameters;
var<workgroup> reason:u32;
fn read_bus(offset:u32, width:u32) -> Known {
    var value=0u; var valid=1u;
    for(var i=0u;i<width;i++) { let bit=wires[plan[offset+i]]; valid &= u32(bit<2u); value |= (bit&1u)<<i; }
    return Known(value,valid);
}
fn memory_address(m:u32) -> u32 {
    let a=read_bus(plan[m+2u],plan[m+3u]);
    return select(NONE,a.value,a.valid==1u && a.value<plan[m+1u]);
}
fn evaluate(lane:u32, begin:u32, endLevel:u32) {
    for(var level=begin;level<endLevel;level++) {
        let first=plan[LEVELS+level]; let end=plan[LEVELS+level+1u];
        for(var index=first+lane;index<end;index+=64u) {
            let g=GATES+index*5u; let op=plan[g]; var bv=0u; var cv=0u;
            if(op>=2u) { bv=wires[plan[g+2u]]; }
            if(op==8u) { cv=wires[plan[g+3u]]; }
            wires[plan[g+4u]]=truth[op*64u+wires[plan[g+1u]]+4u*bv+16u*cv];
        }
        storageBarrier();
    }
}
fn settle(lane:u32) {
    evaluate(lane,0u,READ_BOUNDARY);
    if(MEMORY_COUNT>0u) {
        // Address cones cannot depend on RAM read pins (validated on import).
        for(var i=lane;i<MEMORY_COUNT;i+=64u) {
            let m=MEMORIES+i*11u; let address=memory_address(m); let width=plan[m];
            for(var k=0u;k<width;k++) {
                var bit=2u;
                if(address!=NONE) { bit=ram[plan[m+7u]+address*width+k]; }
                wires[plan[plan[m+5u]+k]]=bit;
            }
        }
        storageBarrier();
    }
    evaluate(lane,READ_BOUNDARY,LEVEL_COUNT);
}
@compute @workgroup_size(64)
fn execute(@builtin(local_invocation_index) lane:u32) {
    if(lane==0u) { result[0]=0u; result[1]=0u; result[2]=0x54583247u; reason=0u; }
    workgroupBarrier();
    settle(lane);
    for(var tick=0u;tick<params.budget;tick++) {
        let record=RECORDS+tick*RECORD_SIZE;
        if(lane==0u) {
            reason=0u;
            if(params.stopEnabled!=0u && HALT_N==1u) {
                let stop=read_bus(HALT,HALT_N);
                if(stop.valid==0u) { reason=5u; } else if(stop.value==1u) { reason=1u; }
            }
            if(reason==0u && params.breakpoint!=NONE) {
                let p=read_bus(PC,PC_N); let phase=read_bus(PHASE,PHASE_N);
                if(p.valid==0u || phase.valid==0u) { reason=5u; }
                else if(phase.value==0u && (p.value&131071u)==params.breakpoint) { reason=2u; }
            }
            if(reason==0u && params.instruction!=0u) {
                let n=read_bus(RETIRED,RETIRED_N); let phase=read_bus(PHASE,PHASE_N); let sleeping=read_bus(LIMBO,LIMBO_N);
                if(n.valid==0u || phase.valid==0u || sleeping.valid==0u) { reason=5u; }
                else if(n.value!=params.retired && (phase.value!=3u || sleeping.value!=0u)) { reason=2u; }
            }
            // Validate every write before updating even one storage element.
            for(var i=0u;i<MEMORY_COUNT;i++) {
                let m=MEMORIES+i*11u; let write_enable=wires[plan[m+6u]]; let at=record+plan[m+10u]; result[at]=NONE;
                if(reason!=0u || write_enable==0u) { continue; }
                if(write_enable!=1u) { reason=3u; continue; }
                let address=memory_address(m);
                if(address==NONE) { reason=4u; continue; }
                var read_only=false;
                for(var k=0u;k<plan[m+9u];k++) { let r=plan[m+8u]+k*2u; read_only = read_only || (address>=plan[r] && address<=plan[r+1u]); }
                if(!read_only) { result[at]=address*plan[m]; }
            }
            result[1]=reason;
        }
        let stopped=workgroupUniformLoad(&reason);
        if(stopped!=0u) { break; }
        storageBarrier();
        for(var i=lane;i<ROOT_COUNT;i+=64u) { result[record+i]=wires[plan[ROOTS+i]]; }
        for(var i=lane;i<FLOP_COUNT;i+=64u) {
            let f=FLOPS+i*5u;
            let enabled=truth[512u+wires[plan[f]]+4u*wires[plan[f+1u]]+16u*wires[plan[f+2u]]];
            wires[WIRES+i]=truth[512u+enabled+4u*plan[f+4u]+16u*wires[plan[f+3u]]];
        }
        for(var i=lane;i<MEMORY_COUNT;i+=64u) {
            let m=MEMORIES+i*11u; let at=record+plan[m+10u]; let offset=result[at];
            if(offset!=NONE) {
                let width=plan[m]; let start=plan[m+7u]+offset;
                for(var k=0u;k<width;k++) {
                    result[at+1u+k]=ram[start+k];
                    result[at+1u+width+k]=wires[plan[plan[m+4u]+k]];
                }
            }
        }
        storageBarrier();
        // All D/control pins and RAM inputs are sampled before any Q changes.
        for(var i=lane;i<FLOP_COUNT;i+=64u) { wires[plan[FLOPS+i*5u]]=wires[WIRES+i]; }
        for(var i=lane;i<MEMORY_COUNT;i+=64u) {
            let m=MEMORIES+i*11u; let at=record+plan[m+10u]; let offset=result[at];
            if(offset!=NONE) { let width=plan[m];
                for(var k=0u;k<width;k++) { ram[plan[m+7u]+offset+k]=result[at+1u+width+k]; }
            }
        }
        storageBarrier();
        settle(lane);
        for(var i=lane;i<PROBE_COUNT;i+=64u) { result[record+SAMPLE+i]=wires[plan[PROBES+i]]; }
        if(lane==0u) { result[0]=tick+1u; }
        storageBarrier();
    }
    for(var i=lane;i<WIRES;i+=64u) { result[8u+i]=wires[i]; }
}`;
}
