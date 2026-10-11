import {DigitalSimulator} from './digital.js';
import {ElectricalSimulator} from './electrical.js';
/** Sample-and-hold co-simulation. DAC outputs are held during each analog step;
 * ADCs sample its endpoint, then all digital flip-flops receive one common edge.
 * This is an explicit coupling scheme, not an analog solve of every digital gate. */
export class MixedSignalSimulator {
    constructor({netlist,circuit,dac=[],adc=[]},{historyLimit=16,historyBytes=16*1024*1024}={}){
        this.digital=new DigitalSimulator(netlist,{historyLimit:0});this.electrical=new ElectricalSimulator(circuit,{historyLimit:0});
        if(!Array.isArray(dac)||!Array.isArray(adc)||dac.length>64||adc.length>64)throw new Error('Invalid converter budget');
        if(!Number.isInteger(historyLimit)||historyLimit<0||historyLimit>256||!Number.isSafeInteger(historyBytes)||historyBytes<0)throw new RangeError('Invalid mixed history budget');
        const usedInputs=new Set(),usedSources=new Set();
        this.dac=dac.map(d=>{
            const bus=this.digital.plan.outputs[d.port]??this.digital.plan.inputs[d.port];
            if(!bus||bus.length!==1||!Number.isFinite(d.low)||!Number.isFinite(d.high)||d.low===d.high||usedSources.has(d.source)||
                !this.electrical.components.some(c=>c.name===d.source&&c.type==='V'))throw new Error('DAC requires a one-bit port and unique voltage source');
            usedSources.add(d.source);return {...d,pin:bus[0]};
        });
        this.adc=adc.map(d=>{
            const bus=this.digital.plan.inputs[d.port];
            if(!bus||bus.length!==1||!this.electrical.nodes.includes(d.node)||!Number.isFinite(d.low)||!Number.isFinite(d.high)||d.low>=d.high||usedInputs.has(d.port))
                throw new Error('ADC requires a unique one-bit input and ordered thresholds');
            usedInputs.add(d.port);return {...d,pin:bus[0]};
        });
        const bytes=4*(this.digital.values.length+this.digital.memories.reduce((n,m)=>n+m.values.length,0))+8*this.electrical.state.length;
        this.historyLimit=Math.min(historyLimit,Math.floor(historyBytes/Math.max(bytes,1)));this.history=[];
    }
    get time(){return this.electrical.time;}
    step(dt){
        const before=this.snapshot();
        try{
            for(const d of this.dac){const value=this.digital.values[d.pin];if(value>1)throw new Error(`DAC ${d.port} is X/Z; no voltage is fabricated`);this.electrical.setSource(d.source,value?d.high:d.low);}
            const result=this.electrical.step(dt);
            for(const d of this.adc){const voltage=this.electrical.voltage(d.node),old=this.digital.values[d.pin];
                this.digital.values[d.pin]=voltage<=d.low?0:voltage>=d.high?1:d.hysteresis&&old<2?old:2;}
            this.digital.settle();this.digital.clock();
            if(this.historyLimit){this.history.push(before);if(this.history.length>this.historyLimit)this.history.shift();}
            return {...result,ticks:this.digital.ticks};
        }catch(error){this._restore(before);throw error;}
    }
    snapshot(){return {schema:'hardware-mixed-1',mapping:JSON.stringify([this.dac,this.adc]),digital:this.digital.snapshot(),electrical:this.electrical.snapshot()};}
    _restore(s){this.digital.restore(s.digital);this.electrical.restore(s.electrical);}
    restore(s){
        if(s?.schema!=='hardware-mixed-1'||s.mapping!==JSON.stringify([this.dac,this.adc]))throw new Error('Mixed snapshot converter mismatch');
        const before=this.snapshot();try{this._restore(s);}catch(error){this._restore(before);throw error;}this.history.length=0;
    }
    back(){const before=this.history.pop();if(!before)return false;this._restore(before);return true;}
}
