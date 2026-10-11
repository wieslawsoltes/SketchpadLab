/** A lossless source view: comments/recognized archival annotations are blanked
 * only in the parsing copy. Character offsets, line endings and original text
 * remain available for diagnostics. In particular [ADDRESS] is NOT a comment.
 * Unknown bracket prose is retained and diagnosed, not silently discarded.
 */
const EDITORIAL = /^\[(?:meta\b|Handwritten\s*:|Page header\s*:|sic\b|best guess\s*:|not clear\b|Judging by\b|Values starting\b|Putting them\b|Every main block\b|This symbol\b|Listing has\b|Handwriting\b)/i;
export function scanAssemblySource(source, { filename = 'program.tx2', semicolonComments = false } = {}) {
    if (typeof source !== 'string') throw new TypeError('Assembly source must be text');
    const view = source.split(''), annotations = [];
    let quoted = false;
    for (let p = 0; p < source.length; p++) {
        const ch = source[p];
        if (ch === '\n' || ch === '\r') { quoted = false; continue; }
        if (ch === '"' && source[p - 1] !== '\\') { quoted = !quoted; continue; }
        if (quoted) continue;
        if (source.startsWith('**', p) || semicolonComments && ch === ';') {
            while (p < source.length && !'\r\n'.includes(source[p])) view[p++] = ' ';
            p--; continue;
        }
        if (ch !== '[' || !EDITORIAL.test(source.slice(p, p + 70))) continue;
        const start = p; let depth = 1;
        for (p++; p < source.length && depth; p++) {
            if (source[p] === '[') depth++;
            if (source[p] === ']') depth--;
        }
        if (depth) {
            const line = source.slice(0, start).split('\n').length;
            throw Object.assign(new SyntaxError('Unterminated archival annotation'), { file: filename, line, column: start - source.lastIndexOf('\n', start) });
        }
        const end = p;
        annotations.push({ kind: /^\[meta\b/i.test(source.slice(start, end)) ? 'metadata' : 'editorial', start, end, text: source.slice(start, end) });
        for (let i = start; i < end; i++) if (!'\r\n'.includes(source[i])) view[i] = ' ';
        p--;
    }
    const code = view.join(''), lines = []; let start = 0, line = 1;
    for (let p = 0; p <= source.length; p++) {
        if (p !== source.length && source[p] !== '\n') continue;
        const end = p > start && source[p - 1] === '\r' ? p - 1 : p;
        lines.push({ file: filename, line: line++, start, end, text: source.slice(start, end), code: code.slice(start, end) });
        start = p + 1;
    }
    return { source, code, lines, annotations };
}
/** Includes consume a single aggregate budget, not one fresh budget per file. */
export class SourceBudget {
    constructor(limit) { if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Source budget must be a positive safe integer'); this.limit = limit; this.bytes = 0; }
    consume(text) {
        if (typeof text !== 'string') throw new TypeError('Included source must be text');
        const bytes = new TextEncoder().encode(text).byteLength;
        if (bytes > this.limit - this.bytes) throw new RangeError('Aggregate source/include byte limit exceeded');
        this.bytes += bytes;
    }
}
