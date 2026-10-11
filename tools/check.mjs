import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
async function files(directory) { const result = []; for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
        result.push(...await files(path));
    else if (/\.(mjs|js)$/.test(entry.name))
        result.push(path);
} return result; }
let count = 0;
for (const directory of ['packages', 'apps', 'examples', 'tools', 'tests'])
    for (const path of await files(join(root, directory))) {
        const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
        if (result.status !== 0) {
            process.stderr.write(result.stderr);
            process.exit(1);
        }
        count++;
    }
console.log(`Syntax checked ${count} JavaScript modules.`);
