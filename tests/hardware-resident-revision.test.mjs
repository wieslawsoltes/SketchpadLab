import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
import {DigitalSimulator} from '../packages/hardware-sim/digital.js';

test('input-only mirror changes do not dirty resident RAM; storage edits do',()=>{
 const b=new NetlistBuilder('RAM revision'),q=b.register('count',8),w=b.input('write',1,1n);
 q.connect(b.add(q.q,b.constant(1,8)).sum);
 b.ram('RAM',{width:8,depth:256,address:q.q,data:q.q,write:w[0]});
 const s=new DigitalSimulator(b.compile()),memory=s.memoryRevision;
 s.input('write',0);s.settle();assert.equal(s.memoryRevision,memory);
 s.clock();assert.equal(s.memoryRevision,memory);s.back();assert.equal(s.memoryRevision,memory);
 s.poke('RAM',9,42);assert.ok(s.memoryRevision>memory);
 const after=s.memoryRevision;s.input('write',1);s.clock();assert.ok(s.memoryRevision>after);
});
