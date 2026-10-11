import test from 'node:test';
import assert from 'node:assert/strict';
import { TX2, Memory, PLUGBOARD_WORDS, READER_LEADER_WORDS, STANDARD_CONFIGURATION, TX2PaperTapeReader, WORD_MASK } from '../packages/tx2-core/index.js';
import { assemble, assembleM4, createTapeBlock, encodeBinaryTape, decodeBinaryTape } from '../packages/tx2-assembler/index.js';
const program=()=>assemble('.org 100\nLDA 200\nSTOP: JMP STOP\n.org 200\n.word 123');
const boot=()=>{const c=new TX2({profile:'tx2-io-research'}); c.bootTape(encodeBinaryTape(program()));return c;};
test('all 32 plugboard words mapped read-only with correct first and final program words',()=>{
 const m=new Memory();assert.equal(PLUGBOARD_WORDS.length,32);assert.equal(m.read(0o377750),0o002200377740n);assert.equal(m.read(0o377777),0o140500377750n);
 for(let n=0;n<32;n++){m.write(0o377740+n,0n);assert.equal(m.read(0o377740+n),PLUGBOARD_WORDS[n]);}
});
test('cold boot executes SPG to initialize all 32 F slots rather than seeding them',()=>{const c=boot();assert(c.F.every(n=>n===0));for(let n=0;n<8;n++)assert(c.step().ok);assert.deepEqual(c.F,STANDARD_CONFIGURATION);assert.equal(c.P,0o377760);});
test('published plugboard reads all 20 original reader-leader words from 120 frames',()=>{const c=boot();c.breakpoints.add(3);assert.equal(c.run({budget:1000}).reason,'breakpoint');assert.equal(c.K,0o52);for(let i=0;i<20;i++)assert.equal(c.memory.peek(i+3),READER_LEADER_WORDS[i]);assert.equal(c.io.require(0o52).position,120);});
test('unmodified numeric reader leader loads discontiguous blocks, disconnects PETR and calls entry',()=>{
 const c=boot(); assert.equal(c.memory.peek(0o100),0n);c.breakpoints.add(0o100);const run=c.run({budget:3000});assert.equal(run.reason,'breakpoint');assert.equal(c.fault,null);
 assert.equal(run.executed,649);assert.equal(c.memory.peek(0o200),0o123n);assert.equal(c.io.require(0o52).connected,false);assert.equal(c.io.require(0o52).missed,false);
 assert(c.step().ok);assert.equal(c.getRegister('A'),0o123n);
});
test('native PUNCH entry survives compiler to tape to actual bootstrap execution',()=>{const image=assembleM4('100|\nNOTSTART→7\nSTART→LDA {17}\nSTOP→JMP STOP\n☛☛PUNCH START');assert.deepEqual(image.diagnostics,[]);assert.equal(image.entry,0o101);const c=new TX2({profile:'tx2-io-research'});c.bootTape(encodeBinaryTape(image));c.breakpoints.add(image.entry);assert.equal(c.run({budget:3000}).reason,'breakpoint');assert(c.step().ok);assert.equal(c.getRegister('A'),0o17n);});
test('complete loader run is reversible, including tape transport and metadata',()=>{const c=boot(),before=c.snapshot();c.breakpoints.add(0o100);const r=c.run({budget:3000});for(let i=0;i<r.executed;i++)assert(c.back());assert.deepEqual(c.memory.snapshot(),before.memory);const now=c.state();now.reason=before.state.reason;assert.deepEqual(now,before.state);});
test('mid-boot snapshot deterministically resumes across independent machines',()=>{const a=boot();a.run({budget:130});const saved=a.snapshot();const b=new TX2({profile:'tx2-io-research'});b.restore(saved);for(const c of [a,b]){c.breakpoints.add(0o100);assert.equal(c.run({budget:3000}).reason,'breakpoint');}assert.deepEqual(a.snapshot(),b.snapshot());});
test('tape parser validates all block checksums and frame boundaries',()=>{const bytes=encodeBinaryTape(program());assert.equal(decodeBinaryTape(bytes).blocks.length,3);const bad=bytes.slice();bad[150]^=1;assert.throws(()=>decodeBinaryTape(bad),/Checksum/);assert.throws(()=>decodeBinaryTape(bytes.subarray(1)),/whole/);assert.throws(()=>decodeBinaryTape(bytes.subarray(0,bytes.length-6)),/truncated/);const wrong=bytes.slice();wrong[0]^=1;assert.throws(()=>decodeBinaryTape(wrong),/leader mismatch/);});
test('all binary-file marker conventions carry identical 36-bit tape words',()=>{const images=[0,64,128].map(marker=>decodeBinaryTape(encodeBinaryTape(program(),{marker})));assert.deepEqual(images[0].blocks,images[1].blocks);assert.deepEqual(images[0].blocks,images[2].blocks);});
test('invalid, failed, overlapping, loader-clobbering and non-entry images cannot be punched',()=>{assert.throws(()=>encodeBinaryTape(assemble('BAD @foo')));for(const words of [[[3,0n]],[[64,0n],[64,1n]],[[64,WORD_MASK+1n]],[[0o377750,0n]]])assert.throws(()=>encodeBinaryTape({words,entry:words[0][0]}));assert.throws(()=>encodeBinaryTape({...program(),entry:999}));assert.throws(()=>createTapeBlock(64,[]));});
test('PETR transport clock does not drift with CPU consumption time and records overrun',()=>{const r=new TX2PaperTapeReader({framesPerSecond:1000});r.mount(Uint8Array.from([1,2,3,4]));r.connect(0o100,0);assert(r.poll(1000));assert.equal(r.transfer(0n,1900).value,1n);assert.equal(r.readyAt,2000);assert(r.poll(3100));assert.equal(r.position,3);assert(r.missed);assert.equal(r.transfer(0n,3100).value,3n);});
test('rewinding a mounted stream reverses at logical BOT without inventing data',()=>{const r=new TX2PaperTapeReader({framesPerSecond:1000});r.mount(Uint8Array.from([1,2,3]));r.connect(0o102,0);r.poll(2000);r.connect(0o106,3000);assert.equal(r.reverseAt,4200);assert.equal(r.direction,'bin');assert(!r.poll(4199));assert(!r.poll(4200));assert.equal(r.direction,'reel');assert(r.poll(5200));assert.equal(r.transfer(0n,5200).value,1n);});
test('tape boot requires INOUT and validates input before resetting',()=>{assert.throws(()=>new TX2().bootTape(new Uint8Array()),e=>e.code==='PROFILE');const c=boot();c.P=123;assert.throws(()=>c.bootTape([]));assert.equal(c.P,123);});

test('executed reader leader rejects a corrupted payload checksum before entering user code', () => {
    const image = assemble('.org 100\nLDA 200\nSTOP: JMP STOP\n.org 200\n.word 123');
    const frames = encodeBinaryTape(image);
    // Flip a data bit in the final payload word, leaving the loader and headers
    // intact. This test deliberately bypasses host-side decodeBinaryTape.
    frames[frames.length - 12] ^= 1;
    const c = new TX2({ profile: 'tx2-io-research' });
    c.bootTape(frames);
    let restarted = false;
    for (let n = 0; n < 2000; n++) {
        const step = c.step(); assert(step.ok, step.ok ? '' : step.error.message);
        assert.notEqual(c.P, 0o100, 'a bad checksum must not reach the user entry');
        if (c.cycles > 20 && c.P === 0o377760) { restarted = true; break; }
    }
    assert(restarted, 'published JPX/JNX checksum checks must restart the read-in program');
    assert.notEqual(c.X[0o56], 0n);
    assert.equal(c.getRegister('A'), 0n);
});
