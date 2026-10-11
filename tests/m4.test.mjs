import test from 'node:test';
import assert from 'node:assert/strict';
import {assemble,assembleM4,evaluateM4,m4CommaTransform,normalizeM4,M4Assembler} from '../packages/tx2-assembler/index.js';
import {decodeInstruction,encodeInstruction,TX2,WORD_MASK} from '../packages/tx2-core/index.js';
const good=s=>{const i=assembleM4(s);assert.deepEqual(i.diagnostics,[]);return i;};
test('all sixteen M4 comma-chart cells match the handbook chart',()=>{
 const input=0o444333222111n,expected=[
 ['444333222111','111000000000','222111000000','333222111000'],
 ['000000000111','000222111000','000111000000','444333222000'],
 ['000000222111','000000111000','222111444333','000000444333'],
 ['000000000111','000000000444','000444000000','000000444333']];
 for(let l=0;l<4;l++)for(let r=0;r<4;r++)assert.equal(m4CommaTransform(l,input,r),BigInt('0o'+expected[l][r]),`${l},${r}`);
 assert.throws(()=>m4CommaTransform(4,1n,0));
});
test('M4 operators evaluate left-to-right, not JavaScript precedence',()=>{assert.equal(evaluateM4('1+2×3'),9n);assert.equal(evaluateM4('1+(2×3)'),7n);assert.equal(evaluateM4('-0'),WORD_MASK);});
test('M4 marked decimal integers and exact fixed-point fractions',()=>{assert.equal(evaluateM4('10'),8n);assert.equal(evaluateM4('10.'),10n);assert.equal(evaluateM4('.4'),1n<<34n);assert.equal(evaluateM4('.5.'),1n<<34n);assert.equal(evaluateM4('10',{radix:10}),10n);assert.equal(evaluateM4('10.',{radix:10}),8n);});
test('M4 field fragments OR full words, scripts can occur after the opcode',()=>{assert.equal(evaluateM4('LDA ¹ 100 ₃'),encodeInstruction({op:'LDA',config:1,index:3,address:0o100}));assert.equal(evaluateM4('¹LDA 100'),encodeInstruction({op:'LDA',config:1,address:0o100}));assert.equal(evaluateM4('ħLDE 100'),encodeInstruction({op:'LDE',hold:false,address:0o100}));});
test('M4 multiple comma fragments reproduce original packed-quarter idiom',()=>assert.equal(evaluateM4('47,47,,47,47'),0o047047047047n));
test('normalizer preserves Greek and elevated letter-parameter groups',()=>assert.equal(normalizeM4('@sup_minus@@sup_1@JPX @sub_X@@sub_R@ 100'),'⟦S:-1⟧JPX ⟦I:XR⟧ 100'));
test('M4 origin, RC pooling and undefined address allocation produce runnable code',()=>{const i=good('100|\nLDA {3}\nADD {4}\nSTA ANSWER\nSTOP→ JMP STOP\n☛☛GOTO 100');const cpu=new TX2();cpu.load(i);for(let n=0;n<3;n++)assert(cpu.step().ok);assert.equal(cpu.memory.peek(Number(i.symbols.get('ANSWER'))),7n);assert.equal(i.entry,0o100);});
test('M4 default origin is T-memory 200000',()=>assert.equal(good('LDA 100').entry,0o200000));
test('M4 direct alias in operand is OR-combined rather than truncated to address',()=>{const i=good('ATLINE=SKM₃.₃ 200044\n100|\nSKZ ATLINE');const d=decodeInstruction(i.words[0][1]);assert.equal(d.op,'SKM');assert.equal(d.config,0o20);assert.equal(d.index,0o63);assert.equal(d.address,0o200044);});
test('M4 pipe construct emits deferred RC pointer with its own index',()=>{const i=good('α=1\nβ=2\n100|\nRSX @sub_alpha@@sub_pipe@@sub_beta@ 200\n202|\n7');const d=decodeInstruction(i.words[0][1]);assert(d.defer);assert.equal(d.index,1);const pointer=i.words.find(([a])=>a===d.address)[1];assert.equal(pointer,(2n<<18n)|0o200n);const cpu=new TX2();cpu.load(i);cpu.X[2]=2n;assert(cpu.step().ok);assert.equal(cpu.X[1],7n);});
test('M4 named macro preserves caller provenance and emits literal pool',()=>{const s='☛☛DEF MOVE|A→B\nhLDE A\nSTE B\n☛☛EMD\n100|\nMOVE|{4}→ANSWER';const i=good(s);assert.equal(i.words.length,4);assert.equal(i.sourceMap.get(0o100).line,6);assert.match(i.sourceMap.get(0o100).stack[0],/MOVE/);const c=new TX2();c.load(i);assert(c.step().ok);assert(c.step().ok);assert.equal(c.memory.peek(Number(i.symbols.get('ANSWER'))),4n);});
test('M4 local tags are hygienic across macro expansions',()=>{const i=good('☛☛DEF LOOP|A\nLOCAL→ LDA A\nJPQ LOCAL\n☛☛EMD\n100|\nLOOP|{3}\nLOOP|{4}');assert.equal(new Set([...i.symbols.keys()].filter(k=>k.includes('LOCAL'))).size,2);assert.equal(decodeInstruction(i.words[1][1]).address,0o100);assert.equal(decodeInstruction(i.words[3][1]).address,0o102);});
test('omitted M4 arguments suppress direct uses; equality indirection supplies zero',()=>{const i=good('☛☛DEF OPT|A,B\nLDA A\nADD B\nFALLBACK=B\nSTA FALLBACK\n☛☛EMD\n100|\nOPT|{7}');assert.equal(i.words.length,3);assert.equal(decodeInstruction(i.words[1][1]).op,'STA');assert.equal(decodeInstruction(i.words[1][1]).address,0);});
test('nested M4 macros used inside multiword RC blocks',()=>{const i=good('☛☛DEF TBS|A\nA\nA\nA\n☛☛EMD\n100|\nLDA {TS→TBS|7}\nSTA TS+2');assert.equal(i.words.length,5);assert.equal(i.symbols.get('TS'),0o102n);assert.deepEqual(i.words.slice(2).map(x=>x[1]),[7n,7n,7n]);});
test('M4 nested macro arguments expand recursively at the call location',()=>{const i=good('☛☛DEF TWICE|A\nA\nA\n☛☛EMD\n100|\nTWICE|(TWICE|3)');assert.deepEqual(i.words.map(x=>x[1]),[3n,3n,3n,3n]);});
test('M4 compound macro supports arguments before its symbol',()=>{const i=good('☛☛DEF A⊟B,C\nLDA A\nADD B\nSTA C\n☛☛EMD\n100|\n1⊟2,3');assert.equal(i.words.length,3);assert.deepEqual(i.words.map(x=>decodeInstruction(x[1]).address),[1,2,3]);});
test('M4 # in literal words refers to the allocated RC address',()=>{const i=good('100|\nLDA {#+1}\nSTA 200');assert.equal(i.words[2][1],0o103n);});
test('M4 equality expressions remain lazy at their usage locations',()=>{const i=good('HERE=#\n100|\nHERE\nHERE');assert.deepEqual(i.words.map(x=>x[1]),[0o100n,0o101n]);});
test('M4 repeated equalities use last definition; duplicate program blocks fail closed',()=>{assert.equal(good('X=1\nX=2\n100|\nX').words[0][1],2n);const i=assembleM4('100|\n1\n100|\n2');assert(i.diagnostics.length);assert.equal(i.words.length,0);assert.equal(i.sourceMap.size,0);});
test('M4 unverified zero division cannot silently manufacture historical code',()=>{assert.throws(()=>evaluateM4('0/0'));assert.equal(evaluateM4('0/0',{zeroDivision:'zero'}),0n);});
test('M4 interactive editing commands and unknown glyphs fail explicitly',()=>{for(const s of ['☛☛REPLACE TAG LDA 1','LDA @unknown@','☛☛DEF M|A\nA']){const i=assembleM4(s);assert(i.diagnostics.length);assert.deepEqual(i.words,[]);}});
test('M4 depth/expansion limits stop recursive macros',()=>assert(new M4Assembler({maxMacroDepth:3}).assemble('☛☛DEF R\nR\n☛☛EMD\nR').diagnostics.length));
test('M4 auto-dispatch leaves the explicit dialect backward compatible',()=>{assert.equal(assemble('100|\nLDA {7}').words.length,2);assert.equal(assemble('.org 100\n.word 10').words[0][1],8n);});
