/** Build a genuinely self-contained npm tarball; no sibling-directory installation assumptions. */
import { mkdir, rm, cp, writeFile, readFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const root = fileURLToPath(new URL('..', import.meta.url)), out = join(root, 'artifacts'), stage = join(out, 'tx2-toolchain');
await mkdir(out, { recursive: true });
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
for (const name of ['tx2-core', 'tx2-assembler', 'hardware-sim'])
    await cp(join(root, 'packages', name), join(stage, name), { recursive: true });
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md'])
    await cp(join(root, name), join(stage, name));
await cp(join(root, 'docs'), join(stage, 'docs'), { recursive: true });
const exportsText = "export * from './tx2-core/index.js';\nexport * from './tx2-assembler/index.js';\n";
await writeFile(join(stage, 'index.js'), exportsText);
await writeFile(join(stage, 'index.d.ts'), exportsText);
await writeFile(join(stage, 'package.json'), JSON.stringify({ name: '@sketchpad-lab/tx2-toolchain', version, type: 'module', description: 'Standalone TX-2 research assembler, emulator and reversible debugger primitives; not full original Sketchpad compatibility', license: 'MIT', engines: { node: '>=22' }, exports: { '.': { types: './index.d.ts', import: './index.js' }, './core': { types: './tx2-core/index.d.ts', import: './tx2-core/index.js' }, './assembler': { types: './tx2-assembler/index.d.ts', import: './tx2-assembler/index.js' }, './hardware': { types: './hardware-sim/index.d.ts', import: './hardware-sim/index.js' }, './provenance': { types: './tx2-assembler/provenance.d.ts', import: './tx2-assembler/provenance.js' } }, types: './index.d.ts', bin: { 'tx2-assemble': './bin/assemble.mjs' } }, null, 2) + '\n');
await mkdir(join(stage, 'bin'));
const cli = await readFile(join(root, 'tools/assemble.mjs'), 'utf8');
await writeFile(join(stage, 'bin/assemble.mjs'), '#!/usr/bin/env node\n' + cli.replace('../packages/tx2-assembler/', '../tx2-assembler/'));
await chmod(join(stage, 'bin/assemble.mjs'), 0o755);
await writeFile(join(stage, 'README.md'), `# TX-2 toolchain ${version}\n\nSelf-contained ESM package, no runtime dependencies. Not a complete TX-2 machine or a working original Sketchpad restoration. Read docs/COMPATIBILITY.md.\n\n\`\`\`js\nimport {assemble, TX2} from '@sketchpad-lab/tx2-toolchain';\nconst image=assemble('.org 100\\nLDA 200\\n.org 200\\n.word 123');\nif(image.diagnostics.length) throw new Error(JSON.stringify(image.diagnostics));\nconst machine=new TX2();\nmachine.load(image);\nconsole.log(machine.step(), machine.getRegister('A'));\nmachine.back();\n\`\`\`\n\nCLI: \`tx2-assemble source.tx2 output.tx2.json\`. Image JSON is a modern interchange format. Use the CLI flag \`--tape\` to emit a standard reader-leader binary tape, and \`TX2.bootTape(bytes)\` in the INOUT research profile to execute the published bootstrap. See docs/TAPE.md; this does not boot the complete original Sketchpad program.\n`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packed = spawnSync(npm, ['pack', '--offline', '--ignore-scripts', '--pack-destination', out], { cwd: stage, stdio: 'inherit' });
if (packed.status !== 0)
    process.exit(packed.status ?? 1);
console.log('Standalone toolchain tarball created in artifacts/.');
