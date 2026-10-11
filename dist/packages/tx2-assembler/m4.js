import { scanAssemblySource, SourceBudget } from './source.js';
/** M4 manuscript front-end. The original bytes never pass through a rewriting API.
 * Sections 6-2 and 6-4, TX-2 Users Handbook (Nov. 1963). This is a new cross-
 * assembler, not the lost M4 executable. Interactive directive editing and
 * external executive symbols are intentionally not synthesized.
 */
import { OPCODES, ALIASES, encodeInstruction, encodeBitSelector } from '../tx2-core/instruction.js';
import { WORD_MASK, word, fromSigned, toSigned, addOnes, subtractOnes } from '../tx2-core/word.js';
const GLYPHS = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', eps: 'ε', epsilon: 'ε', lambda: 'λ', pi: 'π', sigma: 'σ', theta: 'θ',
    times: '×', dot: '.', minus: '-', plus: '+', arr: '→', hand: '☛', hamb: '≡', pipe: '|', rect_dash: '⊟',
    circled_v: '⊕', vee: '∨', wedge: '∧', divide: '/', slash: '/', comma: ',', equal: '=', space: ' ',
    lparen: '(', rparen: ')', lbrace: '{', rbrace: '}', hash: '#', star: '*', not_hold: 'ħ' };
const SUPCHARS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺⁽⁾';
const SUBCHARS = '₀₁₂₃₄₅₆₇₈₉₋₊₍₎';
const NORMALCHARS = '0123456789-+()';
const NAME = '[\\p{L}\\p{N}_.$][\\p{L}\\p{N}_.$ ]*';
const OPERATORS = new Set(['+', '-', '×', '*', '/', '∧', '∨', '⊕', '&', '^']);
const canonical = s => s.replace(/\s+/g, '');
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SCRIPT = /⟦([SI]):([^⟧]*)⟧/gu;
const nameRE = new RegExp(`^(${NAME})\\s*(=|→)(.*)$`, 'u');
const aliasNames = new Set([...Object.keys(OPCODES), ...Object.keys(ALIASES)]);
export function normalizeM4(text) {
    let s = text.replace(/@(?:(sup|sub)_)?([A-Za-z0-9_]+)@/g, (token, level, name) => {
        const v = GLYPHS[name] ?? (/^[A-Za-z0-9]$/.test(name) ? name : null);
        if (v === null)
            throw new SyntaxError(`Unknown manuscript glyph ${token}`);
        return level ? `⟦${level === 'sup' ? 'S' : 'I'}:${v}⟧` : v;
    });
    for (let i = 0; i < SUPCHARS.length; i++)
        s = s.replaceAll(SUPCHARS[i], `⟦S:${NORMALCHARS[i]}⟧`).replaceAll(SUBCHARS[i], `⟦I:${NORMALCHARS[i]}⟧`);
    s = s.replace(/ₐ/g, '⟦I:α⟧').replace(/ᵦ/g, '⟦I:β⟧').replace(/ᵧ/g, '⟦I:γ⟧');
    let last;
    do {
        last = s;
        s = s.replace(/⟦([SI]):([^⟧]*)⟧\s*⟦\1:([^⟧]*)⟧/g, '⟦$1:$2$3⟧');
    } while (last !== s);
    s = s.replace(/⟦I:([1-4])⟧\.⟦I:(\d+)⟧/g, '⟦I:$1.$2⟧');
    return s.replaceAll('->', '→').replaceAll('−', '-').replaceAll('⋅', '×');
}
/** Exact 16-cell M4 comma chart. Adapted from the MIT-licensed TX-2 Simulator
 * reference transcription; attribution and license are in THIRD_PARTY_NOTICES. */
export function m4CommaTransform(leading, value, trailing) {
    if (!Number.isInteger(leading) || leading < 0 || leading > 3 || !Number.isInteger(trailing) || trailing < 0 || trailing > 3)
        throw new RangeError('M4 comma runs must contain 0–3 commas');
    const v = word(value), Q = 511n, H = 262143n, T = 134217727n;
    const masks = [WORD_MASK, Q, H, Q];
    if (trailing === 0)
        return v & masks[leading];
    const table = [
        [null, () => (v & Q) << 27n, () => (v & H) << 18n, () => (v & T) << 9n],
        [null, () => (v & H) << 9n, () => (v & Q) << 18n, () => v & 68719476224n],
        [null, () => (v & Q) << 9n, () => ((v & H) << 18n) | ((v & 68719214592n) >> 18n), () => (v & 68719214592n) >> 18n],
        [null, () => (v & 68585259008n) >> 27n, () => (v & 68585259008n) >> 9n, () => (v & 68719214592n) >> 18n]
    ];
    return table[leading][trailing]();
}
function numeric(s, radix) {
    const fraction = s.startsWith('.'), marked = s.endsWith('.');
    const base = marked ? (radix === 8 ? 10 : 8) : radix;
    const digits = s.slice(fraction ? 1 : 0, marked ? -1 : undefined);
    if (!digits || !(base === 8 ? /^[0-7]+$/ : /^\d+$/).test(digits))
        throw new SyntaxError(`Invalid base-${base} number ${s}`);
    const v = BigInt((base === 8 ? '0o' : '') + digits);
    const result = fraction ? (v * (1n << 35n)) / (BigInt(base) ** BigInt(digits.length)) : v;
    if (result > WORD_MASK)
        throw new RangeError(`M4 number exceeds 36 bits: ${s}`);
    return result;
}
function tokenise(text) {
    const tokens = [];
    for (let p = 0; p < text.length;) {
        const ch = text[p];
        if (/\s/.test(ch)) {
            p++;
            continue;
        }
        if (ch === '⟦') {
            const end = text.indexOf('⟧', p);
            if (end < 0)
                throw new SyntaxError('Unterminated elevated syllable');
            tokens.push({ type: 'script', level: text[p + 1], text: text.slice(p + 3, end) });
            p = end + 1;
            continue;
        }
        if ('()[],'.includes(ch) || OPERATORS.has(ch) || ch === '#' || ch === 'ħ') {
            tokens.push({ type: ch });
            p++;
            continue;
        }
        if (ch === 'h' && /^[A-Z]{3}/.test(text.slice(p + 1))) {
            tokens.push({ type: 'hold' });
            p++;
            continue;
        }
        if (ch === '|' || ch === '{' || ch === '}' || ch === '→' || ch === '=' || ch === '@')
            throw new SyntaxError(`Unexpected M4 character ${ch}`);
        const m = /^[\p{L}\p{N}_.$]+/u.exec(text.slice(p));
        if (!m)
            throw new SyntaxError(`Invalid M4 character ${ch}`);
        let name = m[0];
        p += name.length;
        // Mnemonics and the five AE register symexes terminate at whitespace.
        // Other symexes may contain embedded spaces ("FRESH START").
        if (!aliasNames.has(name) && !['A', 'B', 'C', 'D', 'E'].includes(name) && !/^[\d.]+$/.test(name)) {
            while (true) {
                const extra = /^\s+([\p{L}\p{N}_.$]+)/u.exec(text.slice(p));
                if (!extra)
                    break;
                name += extra[1];
                p += extra[0].length;
            }
        }
        tokens.push({ type: 'atom', text: name });
    }
    return tokens;
}
/** Word expressions: arithmetic has equal precedence; adjacent syllables OR.
 * No JavaScript eval, floating-point literals, or 32-bit integer operators. */
export function evaluateM4(text, { here = 0, radix = 8, resolve = name => { throw new ReferenceError(`Undefined symex ${name}`); }, maxDepth = 128, zeroDivision = 'error' } = {}) {
    if (maxDepth < 0)
        throw new RangeError('M4 expression nesting limit');
    const tokens = tokenise(normalizeM4(text));
    let p = 0, hold = null;
    const binary = (left, op, right) => {
        if (op === '+')
            return addOnes(left, right);
        if (op === '-')
            return subtractOnes(left, right);
        if (op === '×' || op === '*') {
            const product = toSigned(left) * toSigned(right);
            return product < 0 ? word(~(-product)) : word(product);
        }
        if (op === '/') {
            const denominator = toSigned(right);
            if (!denominator) {
                if (zeroDivision === 'zero')
                    return 0n;
                throw new RangeError('M4 zero-divisor result is unverified; supply zeroDivision:"zero" only for an explicitly selected reconstruction hypothesis');
            }
            const q = toSigned(left) / denominator;
            return q < 0 ? word(~(-q)) : word(q);
        }
        if (op === '∧' || op === '&')
            return left & right;
        if (op === '∨')
            return left | right;
        return left ^ right;
    };
    const atom = (depth = 0) => {
        if (depth > maxDepth)
            throw new RangeError('M4 expression nesting limit');
        const t = tokens[p++];
        if (!t)
            throw new SyntaxError('Missing expression operand');
        if (t.type === '+' || t.type === '-') {
            const v = atom(depth + 1);
            return t.type === '-' ? word(~v) : v;
        }
        if (t.type === '(') {
            const v = sequence(')', depth + 1);
            if (tokens[p++]?.type !== ')')
                throw new SyntaxError('Unclosed parenthesis');
            return v;
        }
        if (t.type === '[') {
            const v = sequence(']', depth + 1);
            if (tokens[p++]?.type !== ']') throw new SyntaxError('Unclosed deferred-address bracket');
            if (v > 0o377777n) throw new RangeError('Bracketed deferred address exceeds physical memory');
            return v | 0o400000n;
        }
        if (t.type === '#')
            return BigInt(here);
        if (t.type === 'hold') {
            hold = true;
            return 0n;
        }
        if (t.type === 'ħ') {
            hold = false;
            return 0n;
        }
        if (t.type === 'script') {
            if (t.level === 'I' && /^([1-4])\.(\d+)$/.test(t.text)) {
                const b = /^([1-4])\.(\d+)$/.exec(t.text);
                return BigInt(encodeBitSelector(+b[1], +b[2])) << 18n;
            }
            const v = evaluateM4(t.text, { here, radix, resolve: n => resolve(n, t.level), maxDepth: maxDepth - depth - 1, zeroDivision });
            return word(v << BigInt(t.level === 'S' ? 30 : 18));
        }
        if (t.type !== 'atom')
            throw new SyntaxError(`Expected an atom, found ${t.type}`);
        if (aliasNames.has(t.text))
            return encodeInstruction({ op: t.text });
        if (/^[\d.]+$/.test(t.text))
            return numeric(t.text, radix);
        if (['A', 'B', 'C', 'D', 'E'].includes(t.text))
            return BigInt(0o377604 + 'ABCDE'.indexOf(t.text));
        return word(resolve(canonical(t.text), 'A'));
    };
    const expression = (depth) => {
        let v = atom(depth);
        while (OPERATORS.has(tokens[p]?.type)) {
            // A terminal * is the defer syllable, not multiplication.
            const op = tokens[p].type;
            if (op === '*' && (!tokens[p + 1] || [',', ')', ']'].includes(tokens[p + 1].type)))
                break;
            p++;
            v = binary(v, op, atom(depth));
        }
        return v;
    };
    const sequence = (end = null, depth = 0) => {
        let result = 0n, leading = 0;
        while (tokens[p]?.type === ',') {
            leading++;
            p++;
        }
        if (leading > 3)
            throw new RangeError('M4 comma run exceeds three');
        while (p < tokens.length && tokens[p].type !== end) {
            let fragment = 0n;
            while (p < tokens.length && tokens[p].type !== ',' && tokens[p].type !== end) {
                if (tokens[p].type === '*' && (!tokens[p + 1] || [',', ')', ']'].includes(tokens[p + 1].type))) {
                    fragment |= 1n << 17n;
                    p++;
                    continue;
                }
                fragment |= expression(depth);
            }
            let trailing = 0;
            while (tokens[p]?.type === ',') {
                trailing++;
                p++;
            }
            result |= m4CommaTransform(leading, fragment, trailing);
            leading = trailing;
        }
        return word(result);
    };
    let result = sequence();
    if (p !== tokens.length)
        throw new SyntaxError('Unexpected expression terminator');
    if (hold !== null)
        result = hold ? result | (1n << 35n) : result & ~(1n << 35n);
    return result;
}
function splitTopLevel(text, separators) {
    const parts = [], seps = [];
    let start = 0, depth = 0, script = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '⟦')
            script = true;
        if (c === '⟧')
            script = false;
        if (script)
            continue;
        if (c === '(' || c === '{' || c === '[')
            depth++;
        if (c === ')' || c === '}' || c === ']')
            depth--;
        if (depth < 0)
            throw new SyntaxError('Unbalanced macro delimiters');
        if (!depth && separators.includes(c)) {
            parts.push(text.slice(start, i).trim());
            seps.push(c);
            start = i + 1;
        }
    }
    if (depth)
        throw new SyntaxError('Unbalanced macro delimiters');
    parts.push(text.slice(start).trim());
    return { parts, seps };
}
function unparenthesise(s) {
    while (s.startsWith('(') && s.endsWith(')')) {
        let d = 0, whole = true;
        for (let i = 0; i < s.length - 1; i++) {
            if (s[i] === '(')
                d++;
            if (s[i] === ')')
                d--;
            if (!d) {
                whole = false;
                break;
            }
        }
        if (!whole)
            break;
        s = s.slice(1, -1).trim();
    }
    return s;
}
function substitute(text, mapping) {
    const plain = s => s.replace(/[\p{L}\p{N}_.$]+/gu, n => mapping.has(n) ? mapping.get(n) : n);
    return text.split(/(⟦[SI]:[^⟧]*⟧)/g).map(s => {
        const m = /^⟦([SI]):([^⟧]*)⟧$/.exec(s);
        if (!m)
            return plain(s);
        let inner = plain(m[2]);
        inner = inner.replace(SCRIPT, (_, level, value) => value);
        return `⟦${m[1]}:${inner}⟧`;
    }).join('');
}
function uses(text, name) {
    return new RegExp(`(^|[^\\p{L}\\p{N}_.$])${escape(name)}(?=$|[^\\p{L}\\p{N}_.$])`, 'u').test(text);
}
export class M4Assembler {
    constructor({ maxSourceBytes = 4000000, maxExpandedLines = 100000, maxMacroDepth = 32 } = {}) { Object.assign(this, { maxSourceBytes, maxExpandedLines, maxMacroDepth }); }
    assemble(source, { filename = 'manuscript.tx2as', includes = {}, autoAssign = true, zeroDivision = 'error' } = {}) {
        const diagnostics = [], warnings = [], symbols = new Map(), sourceMap = new Map(), listing = [], words = [], commands = [];
        const report = (r, e) => diagnostics.push({ severity: 'error', file: e.file ?? r?.file ?? filename, line: e.line ?? r?.line ?? 1, column: e.column ?? 1, code: 'M4', message: e.message ?? String(e) });
        const result = () => ({ format: 'tx2-lab-image/1', words: diagnostics.length ? [] : words, entry, symbols, sourceMap: diagnostics.length ? new Map() : sourceMap, listing: diagnostics.length ? [] : listing, diagnostics, warnings, commands,
            stats: { sourceLines: typeof source === 'string' ? source.split('\n').length : 0, expandedLines: operations.length, wordCount: diagnostics.length ? 0 : words.length, symbolCount: symbols.size }, dialect: 'M4 restoration subset (manuscript front-end)' });
        let entry = 0, serial = 0, expanded = 0, radix = 8, entrySpec = null, poolOrigin = null;
        const macros = new Map(), records = [], operations = [], definitions = new Map(), rcQueue = [], rcCache = new Map();
        if (typeof source !== 'string' || new TextEncoder().encode(source).length > this.maxSourceBytes) {
            report(null, new Error('Invalid source or source limit exceeded'));
            return result();
        }
        const budget = new SourceBudget(this.maxSourceBytes);
        if (!['error', 'zero'].includes(zeroDivision)) { report(null, new Error('Invalid zero-division policy')); return result(); }
        const expandOne = (r, depth = 0) => {
            if (depth > this.maxMacroDepth)
                throw new RangeError('M4 macro nesting limit');
            if (++expanded > this.maxExpandedLines)
                throw new RangeError('M4 expanded-line limit');
            let text = unparenthesise(r.clean), tag = '';
            const tm = nameRE.exec(text);
            if (tm?.[2] === '→') {
                tag = tm[1] + '→';
                text = tm[3].trim();
            }
            let macro = null, args = [];
            for (const m of macros.values()) {
                const parts = splitTopLevel(text, '≡|×*=→,/⊟');
                if (m.compound) {
                    const pos = parts.seps.indexOf(m.name);
                    if (pos < 0)
                        continue;
                    macro = m;
                    args = parts.parts;
                }
                else if (canonical(parts.parts[0]) === m.name) {
                    macro = m;
                    args = parts.parts.slice(1);
                }
                if (macro)
                    break;
            }
            if (!macro)
                return [{ ...r, clean: tag + text }];
            if (args.length > macro.params.length)
                throw new SyntaxError(`Too many arguments to ${macro.name}`);
            const mapping = new Map(), omitted = new Set(), prefix = `__M4_${++serial}_`;
            macro.params.forEach((name, i) => { const value = args[i]; mapping.set(name, value ? unparenthesise(value) : '0'); if (!value)
                omitted.add(name); });
            for (const body of macro.body) {
                const local = nameRE.exec(body.clean);
                if (local) {
                    const name = canonical(local[1]);
                    if (mapping.has(name))
                        throw new SyntaxError('M4 dummy parameters cannot define local tags');
                    mapping.set(name, prefix + name);
                }
            }
            const out = [];
            for (const body of macro.body) {
                const equality = nameRE.exec(body.clean)?.[2] === '=';
                if (!equality && [...omitted].some(name => uses(body.clean, name)))
                    continue;
                const transformed = substitute(body.clean, mapping);
                out.push(...expandOne({ ...r, clean: transformed, stack: [...(r.stack ?? []), `${macro.origin.file}:${macro.origin.line} ${macro.name}`], definitionLine: body.line }, depth + 1));
            }
            if (tag) {
                if (out.length)
                    out.unshift({ ...r, clean: tag });
                else
                    out.push({ ...r, clean: tag });
            }
            return out;
        };
        const read = (text, file, depth = 0, stack = []) => {
            if (depth > this.maxMacroDepth)
                throw new RangeError('M4 include depth limit');
            budget.consume(text);
            const parsed = scanAssemblySource(text, { filename: file });
            const lines = parsed.lines;
            for (let i = 0; i < lines.length; i++) {
                const r = { file, line: i + 1, text: lines[i].text, start: lines[i].start, end: lines[i].end, stack: stack.map(name => `include ${name}`), radix };
                try {
                    let raw = lines[i].code.trim();
                    if (!raw)
                        continue;
                    while (raw.endsWith('-') && i + 1 < lines.length) {
                        raw = raw.slice(0, -1) + lines[++i].code.trim();
                    }
                    r.clean = normalizeM4(raw);
                    const inc = /^\.include\s+"([^"]+)"$/.exec(r.clean);
                    if (inc) {
                        if (!Object.hasOwn(includes, inc[1]))
                            throw new Error(`Missing include ${inc[1]}`);
                        if (file === inc[1] || stack.includes(inc[1]))
                            throw new Error('Include cycle');
                        read(includes[inc[1]], inc[1], depth + 1, [...stack, file]);
                        continue;
                    }
                    const meta = /^☛☛\s*([A-Z]+)(.*)$/i.exec(r.clean);
                    if (meta) {
                        const command = meta[1].toUpperCase(), tail = meta[2].trim();
                        if (command === 'DEF' || command === 'DEFINE') {
                            const parts = splitTopLevel(tail, '≡|×*=→,/⊟');
                            const compound = parts.seps.includes('⊟'), name = compound ? '⊟' : canonical(parts.parts[0]);
                            const params = (compound ? parts.parts : parts.parts.slice(1)).map(canonical), body = [];
                            if (!name || params.some(p => !p) || new Set(params).size !== params.length)
                                throw new SyntaxError('Invalid macro parameters');
                            let ended = false;
                            while (++i < lines.length) {
                                const line = normalizeM4(lines[i].code.trim());
                                if (/^☛☛\s*EMD\s*$/i.test(line)) {
                                    ended = true;
                                    break;
                                }
                                if (line)
                                    body.push({ clean: line, line: i + 1 });
                            }
                            if (!ended)
                                throw new SyntaxError('Unterminated M4 macro definition');
                            macros.set(name, { name, params, body, compound, origin: r });
                            continue;
                        }
                        if (['OCT', 'OCTAL', 'DEC', 'DECIMAL'].includes(command)) {
                            radix = command.startsWith('OCT') ? 8 : 10;
                            continue;
                        }
                        if (command === 'RC') {
                            records.push({ ...r, kind: 'rc-origin', clean: tail.replace(/^STORE\s*/i, '') || '#' });
                            continue;
                        }
                        if (command === 'GOTO') {
                            entrySpec = { ...r, clean: tail };
                            continue;
                        }
                        if (['LIST', 'LIS', 'PLIST', 'PLI', 'TYPE', 'TYP', 'TDIR', 'LDIR', 'DIR', 'PUNCH', 'PUN', 'BIN', 'NAME', 'NAM', 'SUMCK', 'SUM'].includes(command)) {
                            commands.push({ command, argument: tail, file, line: r.line });
                            if ((command === 'PUNCH' || command === 'PUN') && tail) entrySpec = { ...r, clean: tail };
                            continue;
                        }
                        throw new SyntaxError(`M4 interactive/external command ${command} is not implemented; no output is fabricated`);
                    }
                    records.push(...expandOne(r));
                }
                catch (e) {
                    report(r, e);
                }
            }
        };
        try {
            read(source, filename);
        }
        catch (e) {
            report(null, e);
        }
        const makeRC = (body, r) => {
            const key = `${r.radix}:${body}`;
            if (rcCache.has(key))
                return rcCache.get(key);
            const name = `__RC_${++serial}`, children = expandOne({ ...r, clean: body });
            rcCache.set(key, name);
            rcQueue.push({ name, children, r });
            return name;
        };
        const rewrite = (text, r) => {
            let s = '';
            for (let i = 0; i < text.length; i++) {
                if (text[i] !== '{') {
                    s += text[i];
                    continue;
                }
                let depth = 1, end = i + 1;
                for (; end < text.length && depth; end++) {
                    if (text[end] === '{')
                        depth++;
                    if (text[end] === '}')
                        depth--;
                }
                if (depth)
                    throw new SyntaxError('Unclosed RC word');
                s += makeRC(text.slice(i + 1, end - 1), r);
                i = end - 1;
            }
            const pipe = /⟦I:([^|⟧]+)\|([^⟧]+)⟧/.exec(s);
            if (pipe) {
                const address = s.slice(pipe.index + pipe[0].length).trim();
                if (!address)
                    throw new SyntaxError('Pipe index needs an operand');
                s = s.slice(0, pipe.index) + `⟦I:${pipe[1]}⟧ ${makeRC(`${address} ⟦I:${pipe[2]}⟧`, r)}*`;
            }
            return s;
        };
        // Equalities are lazy expressions: # is evaluated at the use site.
        // M4 explicitly permits redefinition; arrow tags remain unique.
        for (const r of records) {
            const m = nameRE.exec(r.clean);
            if (m?.[2] === '=') {
                try {
                    definitions.set(canonical(m[1]), { ...r, clean: rewrite(m[3], r) });
                }
                catch (e) {
                    report(r, e);
                }
            }
        }
        let address = 0o200000, allowAuto = false, activeRecord = null;
        const usedAuto = { I: new Set([0]), S: new Set([0]) };
        const value = (text, here, r, chain = []) => evaluateM4(text, { here, radix: r.radix ?? 8, zeroDivision, resolve: (name, kind) => {
                if (symbols.has(name))
                    return symbols.get(name);
                if (definitions.has(name)) {
                    if (chain.includes(name))
                        throw new Error(`Cyclic equality ${[...chain, name].join(' → ')}`);
                    const d = definitions.get(name);
                    return value(d.clean, here, d, [...chain, name]);
                }
                if (!autoAssign || !allowAuto)
                    throw new ReferenceError(`Unassigned symex ${name}`);
                if (kind === 'I' || kind === 'S') {
                    const max = kind === 'I' ? 63 : 31, used = usedAuto[kind];
                    let n = 1;
                    while (used.has(n) && n <= max)
                        n++;
                    if (n > max)
                        throw new RangeError(`No free ${kind === 'I' ? 'index' : 'configuration'} slots`);
                    used.add(n);
                    symbols.set(name, BigInt(n));
                    warnings.push({ code: 'AUTO_REGISTER', message: `${name} assigned ${kind} ${n.toString(8)}` });
                    return BigInt(n);
                }
                if (address > 0o377777)
                    throw new RangeError('RC block exceeds memory');
                symbols.set(name, BigInt(address));
                operations.push({ ...activeRecord, kind: 'word', clean: '0', address: address++ });
                return symbols.get(name);
            } });
        const layout = r => {
            activeRecord = r;
            let s = r.clean;
            if (r.kind === 'rc-origin') {
                poolOrigin = Number(value(s, address, r));
                return;
            }
            const org = splitTopLevel(s, '|');
            if (org.seps.length === 1 && !macros.has(canonical(org.parts[0]))) {
                address = Number(value(org.parts[0], address, r));
                s = org.parts[1];
            }
            const m = nameRE.exec(s);
            if (m?.[2] === '=')
                return;
            if (m?.[2] === '→') {
                const name = canonical(m[1]);
                if (symbols.has(name) || definitions.has(name))
                    throw new Error(`Duplicate tag ${name}`);
                symbols.set(name, BigInt(address));
                s = m[3].trim();
            }
            if (!s)
                return;
            if (!Number.isInteger(address) || address < 0 || address > 0o377777)
                throw new RangeError('Origin exceeds the 17-bit address space');
            operations.push({ ...r, kind: 'word', clean: rewrite(s, r), address: address++ });
        };
        for (const r of records) {
            try {
                layout(r);
            }
            catch (e) {
                report(r, e);
            }
        }
        if (poolOrigin !== null)
            address = poolOrigin;
        for (let i = 0; i < rcQueue.length; i++) {
            if (i > this.maxExpandedLines) {
                report(null, new Error('RC expansion limit'));
                break;
            }
            const block = rcQueue[i];
            symbols.set(block.name, BigInt(address));
            for (const child of block.children) {
                const m = nameRE.exec(child.clean);
                if (m?.[2] === '=')
                    definitions.set(canonical(m[1]), { ...child, clean: rewrite(m[3], child) });
            }
            for (const r of block.children) {
                try {
                    layout(r);
                }
                catch (e) {
                    report(r, e);
                }
            }
        }
        // Reserve explicitly used register syllables before assigning symbolic ones.
        for (const r of operations)
            for (const m of r.clean.matchAll(SCRIPT)) {
                if (!usedAuto[m[1]])
                    continue;
                try {
                    const v = Number(value(m[2], r.address, r));
                    if (v >= 0 && v < (m[1] === 'I' ? 64 : 32))
                        usedAuto[m[1]].add(v);
                }
                catch { /* unresolved symbols allocated below */ }
            }
        allowAuto = true;
        const occupied = new Set();
        for (let i = 0; i < operations.length; i++) {
            const r = operations[i];
            activeRecord = r;
            try {
                if (occupied.has(r.address))
                    throw new Error(`Overlapping archival/program blocks at ${r.address.toString(8)}; select a coherent assembly unit`);
                occupied.add(r.address);
                const v = value(r.clean, r.address, r);
                words.push([r.address, v]);
                sourceMap.set(r.address, { file: r.file, line: r.line, text: r.text, stack: r.stack ?? [], start: r.start, end: r.end });
                listing.push({ address: r.address, word: v, file: r.file, line: r.line, text: r.text });
            }
            catch (e) {
                report(r, e);
            }
            if (operations.length > this.maxExpandedLines) {
                report(r, new Error('Auto-assignment limit'));
                break;
            }
        }
        entry = words[0]?.[0] ?? 0;
        if (entrySpec) {
            try {
                entry = Number(value(entrySpec.clean, entry, entrySpec));
                if (!Number.isInteger(entry) || entry < 0 || entry > 0o377777)
                    throw new RangeError('Invalid GOTO entry');
            }
            catch (e) {
                report(entrySpec, e);
            }
        }
        // Expose constants for inspection without freezing lazy # expressions.
        allowAuto = false;
        for (const [name, r] of definitions) {
            if (r.clean.includes('#'))
                continue;
            try {
                symbols.set(name, value(r.clean, entry, r, [name]));
            }
            catch (e) {
                if (!/Unassigned/.test(e.message))
                    report(r, e);
            }
        }
        return result();
    }
}
export function assembleM4(source, options) { return new M4Assembler().assemble(source, options); }
