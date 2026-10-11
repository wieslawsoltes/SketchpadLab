import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { assemble, serializeImage, encodeBinaryTape } from '../packages/tx2-assembler/index.js';
try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
        tape: { type: 'boolean', default: false }, dialect: { type: 'string', default: 'auto' },
        'no-auto-assign': { type: 'boolean', default: false }, include: { type: 'string', multiple: true, default: [] }
    } });
    if (positionals.length !== 2 || !['auto', 'explicit', 'm4'].includes(values.dialect)) {
        console.error('Usage: tx2-assemble [--tape] [--dialect auto|explicit|m4] [--no-auto-assign] [--include NAME=PATH] input.tx2 output');
        process.exitCode = 2;
    } else {
        const [source, target] = positionals, includes = Object.create(null);
        for (const binding of values.include) {
            const equals = binding.indexOf('=');
            if (equals < 1) throw new Error('--include requires NAME=PATH');
            const name = binding.slice(0, equals);
            if (Object.hasOwn(includes, name)) throw new Error(`Duplicate include binding ${name}`);
            includes[name] = await readFile(binding.slice(equals + 1), 'utf8');
        }
        const result = assemble(await readFile(source, 'utf8'), { filename: source, includes, dialect: values.dialect, autoAssign: !values['no-auto-assign'] });
        if (result.diagnostics.length) {
            for (const d of result.diagnostics) console.error(`${d.file}:${d.line}:${d.column ?? 1}: ${d.code}: ${d.message}`);
            process.exitCode = 1;
        } else {
            // Complete encoding before touching the destination, including all range checks.
            const output = values.tape ? encodeBinaryTape(result) : serializeImage(result);
            await writeFile(target, output);
            console.log(`Assembled ${result.words.length} words; entry ${result.entry.toString(8)}; ${values.tape ? 'reader-leader binary tape' : 'JSON image'}.`);
        }
    }
} catch (error) { console.error(error.message); process.exitCode = 1; }
