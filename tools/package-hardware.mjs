/** Package all transitive modules; installed consumers never depend on workspace siblings. */
import {mkdir,rm,cp,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const out=join(root,'artifacts'),stage=join(out,'hardware-package');
await mkdir(out,{recursive:true});await rm(stage,{recursive:true,force:true});await mkdir(stage);
for(const name of ['hardware-sim','tx2-core','tx2-assembler'])await cp(join(root,'packages',name),join(stage,name),{recursive:true});
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])await cp(join(root,name),join(stage,name));
await cp(join(root,'docs','HARDWARE.md'),join(stage,'README.md'));
const manifest={name:'@sketchpad-lab/hardware-sim',version,type:'module',license:'MIT',engines:{node:'>=22'},
 description:'Independent structural gate, timed logic, electrical and mixed-signal research simulation; not a complete historical TX-2',
 exports:{'.':{types:'./hardware-sim/index.d.ts',import:'./hardware-sim/index.js'},
 './assembler':{types:'./tx2-assembler/index.d.ts',import:'./tx2-assembler/index.js'}},types:'./hardware-sim/index.d.ts'};
await writeFile(join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n');
const args=['pack','--offline','--ignore-scripts','--pack-destination',out];
const result=process.env.npm_execpath?.endsWith('.js')?
 spawnSync(process.execPath,[process.env.npm_execpath,...args],{cwd:stage,stdio:'inherit'}):
 spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:stage,stdio:'inherit'});
if(result.error)throw result.error;if(result.status!==0)throw new Error(`Hardware packaging exited with ${result.status}`);
