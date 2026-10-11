import {mkdtemp,writeFile,cp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url)),{version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const dir=await mkdtemp(join(tmpdir(),'sketchpad-hardware-'));
function run(command,args){const r=spawnSync(command,args,{cwd:dir,stdio:'inherit',timeout:120000});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${command} failed: ${r.status}`);}
try{
 await writeFile(join(dir,'package.json'),JSON.stringify({name:'hardware-consumer',private:true,type:'module'}));
 const args=['install','--offline','--ignore-scripts','--no-audit','--no-fund',join(root,'artifacts',`sketchpad-lab-hardware-sim-${version}.tgz`)];
 if(process.env.npm_execpath?.endsWith('.js'))run(process.execPath,[process.env.npm_execpath,...args]);else run(process.platform==='win32'?'npm.cmd':'npm',args);
 for(const extension of ['mjs','ts'])await cp(join(root,'tests',`hardware-package-consumer.${extension}`),join(dir,`consumer.${extension}`));
 run(process.execPath,['consumer.mjs']);
 run(process.env.TSC_EXECUTABLE??'tsc',['--noEmit','--strict','--target','es2022','--module','nodenext','--moduleResolution','nodenext','consumer.ts']);
 console.log('Hardware tarball runtime and strict TypeScript consumer passed.');
}finally{await rm(dir,{recursive:true,force:true});}
