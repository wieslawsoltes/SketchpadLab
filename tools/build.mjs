import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url)), dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of ['apps', 'packages', 'examples', 'docs', 'originals'])
    await cp(resolve(root, name), resolve(dist, name), { recursive: true });
await writeFile(resolve(dist, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=apps/studio/index.html"><a href="apps/studio/index.html">Open Sketchpad Lab</a>');
console.log('Static distribution built in dist/');
await import('./build-standalone.mjs');
