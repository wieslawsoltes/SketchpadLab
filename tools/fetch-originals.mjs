/** Explicit opt-in network operation. Existing files are verified, never silently overwritten. */
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGINALS, fetchOriginal, verifyOriginal } from '../packages/tx2-assembler/provenance.js';
const directory = fileURLToPath(new URL('../originals/', import.meta.url));
await mkdir(directory, { recursive: true });
let failed = false;
for (const entry of ORIGINALS) {
    const target = join(directory, entry.name);
    try {
        let existing;
        try {
            existing = new Uint8Array(await readFile(target));
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        if (existing) {
            const report = await verifyOriginal(existing, entry);
            if (!report.verified)
                throw new Error(`Existing ${entry.name} does not match the pin. Move it aside for review; no bytes were overwritten.`);
            console.log(`${entry.name}: already verified`);
            continue;
        }
        const result = await fetchOriginal(entry, { signal: AbortSignal.timeout(30000) });
        const temp = target + '.tmp';
        await writeFile(temp, result.bytes, { flag: 'wx' });
        try {
            await rename(temp, target);
        }
        catch (error) {
            await rm(temp, { force: true });
            throw error;
        }
        console.log(`${entry.name}: ${result.bytes.length} unchanged bytes, Git blob ${result.verification.digest}`);
    }
    catch (error) {
        failed = true;
        console.error(`${entry.name}: ${error.message}`);
    }
}
if (failed)
    process.exitCode = 1;
