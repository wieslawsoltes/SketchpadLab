import {NetlistBuilder} from './netlist.js';
import {Gate} from './logic.js';
const json=value=>JSON.stringify(value,null,2);
export function hardwareExamples(){
    const latch=new NetlistBuilder('Cross-coupled NAND latch'),set=latch.input('set_n',1,1n),reset=latch.input('reset_n',1,1n),q=latch.wire('Q',0),nq=latch.wire('Q_bar',1);
    latch.drive(q,Gate.NAND,set[0],nq,latch.zero,3);latch.drive(nq,Gate.NAND,reset[0],q,latch.zero,3);latch.output('Q',[q]);latch.output('Q_bar',[nq]);
    const ring=new NetlistBuilder('Delayed ring oscillator'),wire=ring.wire('feedback',0);ring.drive(wire,Gate.NOT,wire,ring.zero,ring.zero,5);ring.output('Q',[wire]);
    const inverter={nodes:['0','vcc','in','base','out'],components:[
        {name:'VCC',type:'V',p:'vcc',n:'0',source:5},{name:'VIN',type:'V',p:'in',n:'0',source:{pwl:[[0,0],[.0001,0],[.000101,5],[.0003,5],[.000301,0],[.0005,0]]}},
        {name:'RB',type:'R',p:'in',n:'base',value:10000},{name:'RC',type:'R',p:'vcc',n:'out',value:1000},
        {name:'CL',type:'C',p:'out',n:'0',value:1e-9},{name:'Q1',type:'Q',c:'out',b:'base',e:'0',polarity:'npn',betaF:100,betaR:1,Is:1e-14}]};
    const mixed=new NetlistBuilder('Clocked transistor sampler'),drive=mixed.register('drive',1),sample=mixed.register('sample',1),sense=mixed.input('sense');
    drive.connect([mixed.not(drive.q[0])]);sample.connect(sense);mixed.output('drive',drive.q);mixed.output('sample',sample.q);mixed.output('sense',sense);
    const mixCircuit=structuredClone(inverter);mixCircuit.components.find(c=>c.name==='VIN').source=0;
    // Authored diagnostic geometry, compiled to ordinary TX-2 data words. These
    // are not original Sketchpad routines; the board must emit every point via TSD.
    const points=Array.from({length:96},(_,i)=>{
        const t=2*Math.PI*i/96,x=Math.round(340*Math.cos(t)),y=Math.round(340*Math.sin(t));
        const ones=v=>BigInt(v<0?1023^(-v):v);
        return '.word 0o'+((ones(x)<<26n)|(ones(y)<<8n)).toString(8);
    }).join('\n');
    return [
        {name:'TX-2 accumulator',kind:'board',source:'.org 100\nLDA 200\nADD 201\nSTA 202\nSTOP: JMP STOP\n.org 200\n.word 0d1963\n.word 0d2026\n.word 0'},
        {name:'TX-2 multiply / divide',kind:'board',source:'.org 100\nLDA 200\nMUL 201\nDIV 201\nSTA 202\nSTOP: JMP STOP\n.org 200\n.word 0d1963\n.word 0d23\n.word 0'},
        {name:'TX-2 counter loop',kind:'board',source:'.org 100\nLOOP: LDA 200\nADD 201\nSTA 200\nJMP LOOP\n.org 200\n.word 0\n.word 1'},
        {name:'NAND latch · gate delays',kind:'timed',source:json({netlist:latch.compile({allowCycles:true}),stimulus:[{input:'set_n',value:[0],at:10},{input:'set_n',value:[1],at:25},{input:'reset_n',value:[0],at:45},{input:'reset_n',value:[1],at:60}]})},
        {name:'Ring oscillator · gate delays',kind:'timed',source:json({netlist:ring.compile({allowCycles:true}),stimulus:[]})},
        {name:'RC charging · volts / seconds',kind:'electrical',source:json({nodes:['0','in','out'],components:[{name:'V1',type:'V',p:'in',n:'0',source:5},{name:'R1',type:'R',p:'in',n:'out',value:1000},{name:'C1',type:'C',p:'out',n:'0',value:1e-6}]})},
        {name:'NPN inverter · Ebers–Moll',kind:'electrical',source:json(inverter)},
        {name:'Transistor / flip-flop co-simulation',kind:'mixed',source:json({netlist:mixed.compile(),circuit:mixCircuit,dac:[{port:'drive',source:'VIN',low:0,high:5}],adc:[{port:'sense',node:'out',low:.8,high:2,hysteresis:true}]})},
        {name:'Gate scope / light pen',kind:'board',inout:true,extended:false,source:'.org 100\nREX_60 200\nREX_55 700\nIOS_55 30000\nIOS_60 30030\nJPD 104\n.org 200\nAGAIN: REX_1 137\nLOOP: hTSD_1 400\nhJPX^36_1 LOOP\nJMP AGAIN\n.org 400\n'+points+'\n.org 700\nJPD 700'},
        {name:'Gate tape bootstrap',kind:'board',inout:true,boot:'tape',extended:false,source:'.org 100\nLDA 200\nADD 201\nSTA 202\nSTOP: JMP STOP\n.org 200\n.word 0d1963\n.word 0d2026\n.word 0'},
        {name:'Gate paper-tape punch',kind:'board',inout:true,extended:false,source:'.org 100\nREX_63 200\nIOS_63 30002\nJPD 102\n.org 200\n'+Array(6).fill('hTSD 300').join('\n')+'\nSTOP: JMP STOP\n.org 300\n.word 123456765432'}
    ];
}
