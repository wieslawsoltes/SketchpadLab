/** Decode observation storage only. No device readiness, sequence decisions,
 * memory writes or instruction effects are computed by this presentation layer. */
export function observeBoard(board, limit=256) {
    if(!board?.board.inout)return null;
    if(!Number.isInteger(limit)||limit<0||limit>4096)throw new RangeError('Invalid observation limit');
    const s=board.simulator,read=name=>Number(s.read(name));
    const signed=word=>word&512?-(word^1023):word;
    const ring=(name,decode)=>{
        const count=read(name+'Count'),depth=board.board.traceDepth,n=Math.min(count,depth,limit),rows=[];
        for(let index=count-n;index<count;index++)rows.push(decode(s.peek(name+'_TRACE',index%depth),index));
        return {count,retained:n,dropped:count-n,rows};
    };
    const scope=ring('scope',(record,index)=>{
        const word=record&((1n<<36n)-1n),mode=Number(record>>36n&4095n);
        return {index,x:signed(Number(word>>26n&1023n)^(mode&128?512:0)),
            y:signed(Number(word>>8n&1023n)^(mode&64?512:0)),mode,clock24:Number(record>>48n),word:word.toString(8).padStart(12,'0')};
    });
    const punch=ring('punch',(record,index)=>({index,frame:Number(record&127n),clock:Number(record>>7n)}));
    return {clock:read('deviceClock'),sequence:read('K'),limbo:!!read('limbo'),
        tape:{position:read('tapePosition'),frames:s.memory('TAPE_ROM').depth===1&&board.board.initialMemories.get('TAPE_ROM').size===0?0:board.board.initialMemories.get('TAPE_ROM').size,
            eof:!!read('tapeEOF'),rewinding:!!read('tapeRewinding'),connected:!!read('io52.connected'),ready:!!read('io52.ready'),missed:!!read('io52.missed')},
        scope:{count:scope.count,dropped:scope.dropped,points:scope.rows,connected:!!read('io60.connected')},
        punch:{count:punch.count,dropped:punch.dropped,frames:punch.rows,connected:!!read('io63.connected')},
        pen:{x:signed(read('penX')),y:signed(read('penY')),radius:read('penRadius'),down:!!read('penDown'),hits:read('penHits')},
        trap:{mode:read('io42.mode'),markingDisabled:!!read('markingDisabled')}};
}
