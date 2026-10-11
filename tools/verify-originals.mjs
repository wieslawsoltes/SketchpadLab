import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ORIGINALS, verifyOriginal, auditListing } from '../packages/tx2-assembler/provenance.js';
const report = [];
for (const entry of ORIGINALS)
    try {
        const bytes = new Uint8Array(await readFile(new URL('../originals/' + entry.name, import.meta.url))), verification = await verifyOriginal(bytes, entry), audit = auditListing(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        report.push({ name: entry.name, ...verification, audit });
        if (!verification.verified)
            process.exitCode = 1;
    }
    catch (error) {
        report.push({ name: entry.name, verified: false, error: error.code === 'ENOENT' ? 'Not fetched. Run npm run originals:fetch, or import the exact original bytes.' : error.message });
        process.exitCode = 1;
    }
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--report'))
    await writeFile(new URL('../originals/verification-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
