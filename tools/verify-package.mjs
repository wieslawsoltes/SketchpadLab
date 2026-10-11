/** Verify the actual tarball in an isolated installation, not workspace symlinks.
 * Requires local npm and TypeScript; runtime dependency/network installs are disabled. */
import { mkdtemp, writeFile, readFile, cp, rm, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const tarball = resolve(process.argv[2] ?? join(root, 'artifacts', `sketchpad-lab-tx2-toolchain-${version}.tgz`));
await access(tarball);
await mkdir(join(root, 'test-results'), { recursive: true });
const report = join(root, 'test-results', 'package-report.json');
const directory = await mkdtemp(join(tmpdir(), 'sketchpad-package-'));
function run(command, args, env = process.env) {
    const result = spawnSync(command, args, { cwd: directory, env, stdio: 'inherit', timeout: 60000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}
try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'sketchpad-package-validation', private: true, type: 'module' }));
    const options = ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', tarball];
    // npm run sets the CLI JavaScript path, avoiding platform shell quoting.
    if (process.env.npm_execpath?.endsWith('.js')) run(process.execPath, [process.env.npm_execpath, ...options]);
    else run('npm', options);
    await cp(join(root, 'tests/package-consumer.mjs'), join(directory, 'consumer.mjs'));
    await cp(join(root, 'tests/package-consumer.ts'), join(directory, 'consumer.ts'));
    run(process.execPath, ['consumer.mjs'], { ...process.env, PACKAGE_REPORT: report });
    run(process.env.TSC_EXECUTABLE ?? 'tsc', ['--noEmit', '--strict', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', 'consumer.ts']);
    const data = JSON.parse(await readFile(report, 'utf8'));
    data.strictTypeScriptConsumer = true;
    await writeFile(report, JSON.stringify(data, null, 2) + '\n');
    console.log(`Installed-package API, CLI and strict declarations verified: ${report}`);
} finally {
    await rm(directory, { recursive: true, force: true });
}
