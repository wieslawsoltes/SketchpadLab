import {HardwareSession} from '../../packages/hardware-sim/session.js';
const session=new HardwareSession();let pending=Promise.resolve(),queued=0;
self.onmessage=({data})=>{
    if(!data||!Number.isSafeInteger(data.id))return;
    const reply=value=>self.postMessage({id:data.id,...value});
    if(data.op==='pause'){session.pause();reply({ok:true,state:session.summary()});return;}
    if(++queued>16){queued--;reply({ok:false,error:'Hardware command queue limit exceeded'});return;}
    pending=pending.then(async()=>{
        try{
            let state,payload;
            switch(data.op){
                case 'load':state=await session.load(data.configuration);break;
                case 'advance':state=await session.advance(data.options,state=>self.postMessage({event:'progress',state}));break;
                case 'back':state=session.back();break;
                case 'checkpoint':state=session.checkpoint();break;
                case 'restore':state=session.restoreCheckpoint();break;
                case 'restoreFile':state=await session.restoreSnapshot(data.text);break;
                case 'snapshot':payload={filename:'hardware-snapshot.json',text:session.exportSnapshot()};break;
                case 'trace':payload={filename:session.electrical()?'electrical-trace.json':'gate-waveforms.vcd',text:session.exportTrace()};break;
                case 'netlist':payload={filename:'hardware-wiring.json',text:session.exportNetlist()};break;
                case 'inspect':payload=session.inspect(data.port,data.bit);break;
                case 'state':state=session.summary();break;
                default:throw new Error('Unknown hardware command');
            }
            if(state)state.busy=false;reply({ok:true,state,payload});
        }catch(error){reply({ok:false,error:error.message??String(error),state:session.summary()});}
        finally{queued--;}
    });
};
