export const ORIGINALS = Object.freeze([
    { name: 'sk.tx2as', bytes: 239176, blob: '01e3c1bd9ea8b024098d6dea152c13f191e37b0a', repository: 'TX-2/Sketchpad', description: 'Recovered Sketchpad listing transcription; archival program sections and equalities.' },
    { name: 'sk2.tx2as', bytes: 238611, blob: '45bfd756ae7a18148645de0ac99a6689c4e10906', repository: 'TX-2/Sketchpad', description: 'Alternate recovered listing transcription. Not asserted to be a later running release.' }
]);
export async function gitBlobHash(bytes) {
    if (!(bytes instanceof Uint8Array))
        throw new TypeError('Expected original source bytes');
    const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`), data = new Uint8Array(prefix.length + bytes.length);
    data.set(prefix);
    data.set(bytes, prefix.length);
    const hash = await crypto.subtle.digest('SHA-1', data);
    return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function verifyOriginal(bytes, entry) { const digest = await gitBlobHash(bytes); return { verified: digest === entry.blob && bytes.length === entry.bytes, digest, expected: entry.blob, bytes: bytes.length }; }
export async function fetchOriginal(entry, { signal } = {}) {
    const response = await fetch(`https://api.github.com/repos/${entry.repository}/git/blobs/${entry.blob}`, { signal, headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok)
        throw new Error(`GitHub source fetch: HTTP ${response.status}. Import a local copy or run the fetch script instead.`);
    const blob = await response.json();
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string')
        throw new Error('Unexpected GitHub blob encoding');
    const bytes = Uint8Array.from(atob(blob.content), c => c.charCodeAt(0)), verification = await verifyOriginal(bytes, entry);
    if (!verification.verified)
        throw new Error('Original source failed its pinned byte-length / Git-blob integrity check');
    return { entry, bytes, verification, source: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
}
export function auditListing(source) {
    const lines = source.split(/\r?\n/), metadata = lines.filter(s => /^\[meta /.test(s)), equalities = new Map(), duplicates = [];
    for (let i = 0; i < lines.length; i++) {
        const m = /^([A-Z][A-Z0-9]*)\s*=/.exec(lines[i]);
        if (m) {
            if (equalities.has(m[1]))
                duplicates.push({ name: m[1], line: i + 1, previous: equalities.get(m[1]) });
            equalities.set(m[1], i + 1);
        }
    }
    const glyphs = new Set([...source.matchAll(/@[a-zA-Z0-9_]+@/g)].map(m => m[0]));
    return { lines: lines.length, archivalPageRecords: metadata.length, macroDefinitions: lines.filter(s => /@hand@@hand@DEF\b/.test(s)).length, glyphKinds: glyphs.size, equalityNames: equalities.size, duplicateEqualities: duplicates, uncertainAnnotations: lines.flatMap((s, i) => /\[(?:[^\]]*\b(?:illegible|unclear|unreadable|sic|or \"|Handwritten)[^\]]*)\]/i.test(s) ? [{ line: i + 1, text: s }] : []) };
}
