import { scanAssemblySource, SourceBudget } from './source.js';
export { scanAssemblySource } from './source.js';
import { assembleM4, M4Assembler } from './m4.js';
export { M4Assembler, assembleM4, evaluateM4, normalizeM4, m4CommaTransform } from './m4.js';
import { evaluate, ExpressionError } from './expression.js';
import { encodeInstruction, encodeBitSelector, OPCODES, ALIASES, decodeInstruction } from '../tx2-core/instruction.js';
import { word, fromSigned, WORD_MASK, formatOctal } from '../tx2-core/word.js';
export { evaluate, tokenizeExpression, ExpressionError } from './expression.js';
const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', eps: 'ε', epsilon: 'ε', lambda: 'λ', pi: 'π', sigma: 'σ', theta: 'θ' };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₋': '-', 'ₐ': 'α' };
/** Normalize a parsing view only. The input and provenance bytes remain unchanged. */
export function normalizeSourceLine(line) {
    return line.replace(/@((?:sup|sub)_)?([a-zA-Z0-9_]+)@/g, (all, prefix, name) => {
        const value = GREEK[name] ?? ({ times: '*', dot: '.', minus: '-', plus: '+', arr: '→', hand: '☛' }[name]) ?? (/^\d$/.test(name) ? name : null);
        if (value === null)
            return all;
        return prefix === 'sup_' ? `{S:${value}}` : prefix === 'sub_' ? `{I:${value}}` : value;
    }).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, s => [...s].map(c => `{S:${SUP[c]}}`).join(''))
        .replace(/[₀₁₂₃₄₅₆₇₈₉₋ₐ]+/g, s => [...s].map(c => `{I:${SUB[c]}}`).join(''));
}
function splitArguments(s) {
    const out = [];
    let depth = 0, last = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(')
            depth++;
        if (s[i] === ')')
            depth--;
        if (s[i] === ',' && !depth) {
            out.push(s.slice(last, i).trim());
            last = i + 1;
        }
    }
    out.push(s.slice(last).trim());
    return out;
}
function asWord(n) {
    if (n < 0n)
        return fromSigned(n);
    if (n > WORD_MASK)
        throw new RangeError('Word exceeds 36 bits');
    return n;
}
function checked(n, max, what) {
    if (n < 0n || n > BigInt(max))
        throw new RangeError(`${what} out of range: ${n}`);
    return Number(n);
}
const ID = '[\\p{L}_.$][\\p{L}\\p{N}_.$]*';
export class Assembler {
    constructor({ maxSourceBytes = 4000000, maxExpandedLines = 100000, maxMacroDepth = 32 } = {}) { Object.assign(this, { maxSourceBytes, maxExpandedLines, maxMacroDepth }); }
    assemble(source, { filename = 'program.tx2', includes = {}, dialect = 'auto', ...m4Options } = {}) {
        if (dialect === 'm4' || dialect === 'auto' && (/☛☛|@hand@@hand@|→|@arr@/.test(source) || /^\s*[\p{L}\p{N}]+\s*\|/mu.test(source)))
            return new M4Assembler(this).assemble(source, { filename, includes, ...m4Options });
        const diagnostics = [], records = [], symbols = new Map(), definitions = new Map(), sourceMap = new Map(), words = [], listing = [];
        const report = (r, code, message) => diagnostics.push({ severity: 'error', file: r.file ?? filename, line: r.line ?? 1, column: 1, code, message });
        const macros = new Map();
        let expansions = 0, serial = 0;
        if (typeof source !== 'string' || new TextEncoder().encode(source).length > this.maxSourceBytes)
            return { words: [], entry: 0, symbols, sourceMap, listing, diagnostics: [{ severity: 'error', line: 1, file: filename, code: 'SOURCE_SIZE', message: 'Source exceeds configured limit or is not text' }] };
        const budget = new SourceBudget(this.maxSourceBytes);
        const expand = (text, file, depth = 0, stack = [], synthetic = false) => {
            if (depth > this.maxMacroDepth)
                throw new Error('Expansion nesting limit reached');
            if (!synthetic) budget.consume(text);
            const lines = scanAssemblySource(text, { filename: file, semicolonComments: true }).lines;
            for (let index = 0; index < lines.length; index++) {
                const original = lines[index].text, r = { file, line: index + 1, text: original, stack, start: lines[index].start, end: lines[index].end }, clean = normalizeSourceLine(lines[index].code).trim();
                if (!clean)
                    continue;
                if (++expansions > this.maxExpandedLines)
                    throw new Error('Expanded source limit reached');
                let m;
                if ((m = /^\.include\s+"([^"\n]+)"$/i.exec(clean))) {
                    if (!Object.hasOwn(includes, m[1])) {
                        report(r, 'INCLUDE', `Include '${m[1]}' was not supplied`);
                        continue;
                    }
                    if ((file === m[1] || stack.includes(m[1]))) {
                        report(r, 'INCLUDE_CYCLE', 'Cyclic include');
                        continue;
                    }
                    expand(includes[m[1]], m[1], depth + 1, [...stack, file]);
                    continue;
                }
                if ((m = /^\.macro\s+([\w.$]+)(?:\s+(.*))?$/i.exec(clean))) {
                    const body = [];
                    let found = false;
                    while (++index < lines.length) {
                        if (/^\.endm\s*$/i.test(lines[index].code.trim())) {
                            found = true;
                            break;
                        }
                        body.push(lines[index].text);
                    }
                    if (!found) {
                        report(r, 'MACRO_END', 'Unterminated .macro');
                        continue;
                    }
                    if (macros.has(m[1])) {
                        report(r, 'DUPLICATE_MACRO', `Macro ${m[1]} already defined`);
                        continue;
                    }
                    macros.set(m[1], { parameters: m[2] ? splitArguments(m[2]) : [], body: body.join('\n'), origin: r });
                    continue;
                }
                if (clean.startsWith('☛☛')) {
                    report(r, 'M4_DIRECTIVE', 'M4 manuscript directives/macros require restoration; they are not treated as no-ops.');
                    continue;
                }
                const head = /^(\S+)(?:\s+(.*))?$/.exec(clean), macro = macros.get(head[1]);
                if (macro) {
                    const args = head[2] ? splitArguments(head[2]) : [];
                    if (args.length !== macro.parameters.length) {
                        report(r, 'MACRO_ARITY', `Expected ${macro.parameters.length} macro arguments`);
                        continue;
                    }
                    let body = macro.body.replace(/%%([\w.$]+)/g, `__M${++serial}_$1`);
                    for (let p = 0; p < args.length; p++)
                        body = body.replaceAll('\\' + macro.parameters[p], `(${args[p]})`);
                    const start = records.length;
                    expand(body, file, depth + 1, [...stack, `${file}:${r.line}`], true);
                    for (let n = start; n < records.length; n++) {
                        records[n].macroDefinition = records[n].line;
                        records[n].line = r.line;
                    }
                    continue;
                }
                records.push({ ...r, clean });
            }
        };
        try {
            expand(source, filename);
        }
        catch (e) {
            report({ line: 1 }, 'EXPANSION', e.message);
        }
        const evalAt = (expression, here, chain = []) => evaluate(expression, { here, resolve: name => {
                if (symbols.has(name))
                    return symbols.get(name);
                if (definitions.has(name)) {
                    if (chain.includes(name))
                        throw new Error(`Cyclic equality: ${[...chain, name].join(' → ')}`);
                    const d = definitions.get(name);
                    return valueOf(d.expression, d.address, [...chain, name]);
                }
                throw new Error(`Undefined symbol ${name}`);
            } });
        const parseInstruction = (text, here, chain = []) => {
            let configText = '', indexText = '', hold;
            text = text.replace(/^(?:\{S:[^}]+\})+/, s => { configText = [...s.matchAll(/\{S:([^}]+)\}/g)].map(m => m[1]).join(''); return ''; });
            const m = /^([hu]?)([A-Z]{3})(.*)$/.exec(text);
            if (!m || !Object.hasOwn(OPCODES, m[2]) && !Object.hasOwn(ALIASES, m[2]))
                return null;
            hold = m[1] === 'h' ? true : m[1] === 'u' ? false : undefined;
            let tail = m[3].trimStart();
            // Canonical syntax: LDA^configuration_index address; indices may be symbols in parentheses.
            let a;
            if ((a = /^\^(-?[0-7]+|\([^)]*\))/.exec(tail))) {
                configText = a[1];
                tail = tail.slice(a[0].length);
            }
            if ((a = /^_([0-7]+(?:\.\d+)?|\([^)]*\))/.exec(tail))) {
                indexText = a[1];
                tail = tail.slice(a[0].length);
            }
            tail = tail.trimStart().replace(/^(?:\{I:[^}]+\})+/, s => { indexText = [...s.matchAll(/\{I:([^}]+)\}/g)].map(m => m[1]).join(''); return ''; }).trim();
            const c = configText ? evalAt(configText, here, chain) : 0n;
            const config = c < 0n ? Number(fromSigned(c, 5)) : checked(c, 31, 'Configuration');
            let index = 0;
            if (indexText) {
                const bit = /^([1-4])\.(\d+)$/.exec(indexText);
                index = bit ? encodeBitSelector(Number(bit[1]), Number(bit[2])) : checked(evalAt(indexText, here, chain), 63, 'Index');
            }
            let defer = false;
            if (tail.startsWith('[') && tail.endsWith(']')) {
                defer = true; tail = tail.slice(1, -1).trim();
            }
            if (tail.startsWith('*')) {
                defer = true;
                tail = tail.slice(1).trim();
            }
            const addr = checked(evalAt(tail || '0', here, chain), 0o777777, 'Operand');
            if (addr > 0o377777)
                defer = true;
            return encodeInstruction({ op: m[2], config, index, address: addr & 0o377777, defer, hold });
        };
        const valueOf = (text, here, chain = []) => parseInstruction(text, here, chain) ?? evalAt(text, here, chain);
        let address = 0, entryExpression = null;
        const operations = [];
        for (const r of records) {
            let text = r.clean;
            try {
                if (/@[a-zA-Z0-9_]+@/.test(text))
                    throw new Error('Unrecognized manuscript glyph; transcription requires review');
                let m;
                if ((m = new RegExp(`^(${ID})\\s*:\\s*(.*)$`, 'u').exec(text))) {
                    if (symbols.has(m[1]) || definitions.has(m[1]))
                        throw new Error(`Duplicate symbol ${m[1]}`);
                    symbols.set(m[1], BigInt(address));
                    text = m[2];
                    if (!text)
                        continue;
                }
                if ((m = new RegExp(`^(?:\\.equ\\s+)?(${ID})\\s*(?:=|,)\\s*(.+)$`, 'u').exec(text))) {
                    if (symbols.has(m[1]) || definitions.has(m[1]))
                        throw new Error(`Duplicate equality ${m[1]}: distinct archival versions need separate assembly units`);
                    definitions.set(m[1], { expression: m[2], address, r });
                    continue;
                }
                if ((m = /^\.org\s+(.+)$/i.exec(text))) {
                    address = checked(evalAt(m[1], address), 0o377777, 'Origin');
                    continue;
                }
                if ((m = /^\.entry\s+(.+)$/i.exec(text))) {
                    entryExpression = { expression: m[1], address, r };
                    continue;
                }
                if ((m = /^\.assert\s+(.+)$/i.exec(text))) {
                    operations.push({ ...r, kind: 'assert', expression: m[1], address });
                    continue;
                }
                if ((m = /^\.fill\s+(.+)$/i.exec(text))) {
                    const args = splitArguments(m[1]);
                    if (args.length !== 2)
                        throw new Error('.fill count, value requires two arguments');
                    const count = checked(evalAt(args[0], address), 1 << 17, 'Fill count');
                    operations.push({ ...r, kind: 'fill', count, expression: args[1], address });
                    address += count;
                }
                else if ((m = /^\.word\s+(.+)$/i.exec(text))) {
                    for (const expression of splitArguments(m[1]))
                        operations.push({ ...r, kind: 'word', expression, address: address++ });
                }
                else {
                    if (text.startsWith('.'))
                        throw new Error(`Unknown directive ${text.split(/\s/)[0]}`);
                    operations.push({ ...r, kind: 'word', expression: text, address: address++ });
                }
                if (address > 1 << 17)
                    throw new Error('Program extends beyond the 17-bit address space');
            }
            catch (e) {
                report(r, 'ASSEMBLY', e.message);
            }
        }
        for (const [name, d] of definitions)
            try {
                symbols.set(name, valueOf(d.expression, d.address, [name]));
            }
            catch (e) {
                report(d.r, 'SYMBOL', e.message);
            }
        const occupied = new Set();
        for (const r of operations)
            try {
                if (r.kind === 'assert') {
                    if (!evalAt(r.expression, r.address))
                        throw new Error(`Assertion failed: ${r.expression}`);
                    continue;
                }
                const count = r.kind === 'fill' ? r.count : 1;
                for (let j = 0; j < count; j++) {
                    const a = r.address + j;
                    if (occupied.has(a))
                        throw new Error(`Overlapping output at ${formatOctal(a, 6)}`);
                    const v = asWord(valueOf(r.expression, a));
                    occupied.add(a);
                    words.push([a, v]);
                    sourceMap.set(a, { file: r.file, line: r.line, text: r.text, stack: r.stack, start: r.start, end: r.end });
                    listing.push({ address: a, word: v, file: r.file, line: r.line, text: r.text });
                }
            }
            catch (e) {
                report(r, 'EMIT', e.message);
            }
        let entry = words[0]?.[0] ?? 0;
        if (entryExpression)
            try {
                entry = checked(evalAt(entryExpression.expression, entryExpression.address), 0o377777, 'Entry');
            }
            catch (e) {
                report(entryExpression.r, 'ENTRY', e.message);
            }
        return { format: 'tx2-lab-image/1', words: diagnostics.length ? [] : words, entry, symbols, sourceMap: diagnostics.length ? new Map() : sourceMap, listing: diagnostics.length ? [] : listing, diagnostics, stats: { sourceLines: source.split('\n').length, expandedLines: records.length, wordCount: diagnostics.length ? 0 : words.length, symbolCount: symbols.size }, dialect: 'TX2-Lab explicit dialect; M4 manuscript compatibility is partial' };
    }
}
export function assemble(source, options) { return new Assembler().assemble(source, options); }
export function serializeImage(image) {
    if (image.diagnostics?.length)
        throw new Error('Cannot serialize a failed assembly');
    return JSON.stringify({ format: image.format, entry: image.entry, words: image.words.map(([a, w]) => [a, w.toString(8)]), sourceMap: [...image.sourceMap], symbols: [...image.symbols].map(([s, v]) => [s, v.toString()]) }, null, 2);
}
export function deserializeImage(json) {
    const d = JSON.parse(json);
    if (d.format !== 'tx2-lab-image/1' || !Number.isInteger(d.entry) || d.entry < 0 || d.entry > 0o377777 || !Array.isArray(d.words) || d.words.length > 1 << 17)
        throw new Error('Invalid image');
    const used = new Set();
    const words = d.words.map(([a, s]) => {
        if (!Number.isInteger(a) || a < 0 || a > 0o377777 || used.has(a) || typeof s !== 'string' || !/^[0-7]{1,12}$/.test(s))
            throw new Error('Invalid image word/address');
        used.add(a);
        return [a, BigInt('0o' + s)];
    });
    return { ...d, words, diagnostics: [], sourceMap: new Map(d.sourceMap ?? []), symbols: new Map((d.symbols ?? []).map(([s, v]) => [s, BigInt(v)])) };
}

export { createTapeBlock, encodeBinaryTape, decodeBinaryTape } from './tape.js';
