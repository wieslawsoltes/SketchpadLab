import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NetlistBuilder} from '../packages/hardware-sim/netlist.js';
test('oversized or negative initial buses are rejected before allocating partial storage',()=>{
 const b=new NetlistBuilder(),initial=b.names.length;
 assert.throws(()=>b.input('bad',9,-1n),/does not fit/);assert.throws(()=>b.register('bad',9,512n),/does not fit/);assert.equal(b.names.length,initial);
});
