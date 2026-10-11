/** Standard reader-leader binary tape format. Not the explicit-dialect JSON
 * image format and not a recovered Sketchpad executable. See docs/TAPE.md. */
import { READER_LEADER_WORDS } from '../tx2-core/boot.js';
import { unsplayWord, cycleAndSplay } from '../tx2-core/peripherals.js';
import { WORD_MASK, HALF_MASK, addOnes, fromSigned, toSigned, isZero, joinHalves, leftHalf, rightHalf } from '../tx2-core/word.js';
import { encodeInstruction } from '../tx2-core/instruction.js';
const checksum = words => words.reduce((sum, w) => addOnes(addOnes(sum, rightHalf(w), 18), leftHalf(w), 18), 0n);
export function createTapeBlock(origin, words, next = 3) {
    if (!Number.isInteger(origin) || origin < 0 || origin > 0o377777 ||
        !Number.isInteger(next) || next < 0 || next > 0o377777 ||
        !Array.isArray(words) || !words.length || words.length > 0o377777 || origin + words.length > 0o400000 ||
        words.some(w => typeof w !== 'bigint' || w < 0n || w > WORD_MASK))
        throw new RangeError('Invalid reader-leader block');
    const block = [joinHalves(fromSigned(1n - BigInt(words.length), 18), BigInt(origin + words.length - 1)), ...words];
    const sum = addOnes(checksum(block), BigInt(next), 18);
    block.push(joinHalves(HALF_MASK ^ sum, BigInt(next)));
    return block;
}
export function encodeBinaryTape(image, { marker = 0x80 } = {}) {
    if (![0, 0x40, 0x80].includes(marker)) throw new RangeError('Tape file marker must be 0, 0x40 or 0x80');
    if (!image || image.diagnostics?.some(d => d.severity === 'error') || !Array.isArray(image.words) || !image.words.length)
        throw new TypeError('Cannot punch an empty or failed assembly');
    if (image.words.length > 0o220000) throw new RangeError('Image exceeds writable STU memory');
    const sorted = image.words.slice().sort((a, b) => a[0] - b[0]), chunks = [];
    let last = -1;
    for (const pair of sorted) {
        if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError('Malformed image word');
        const [address, value] = pair;
        if (!Number.isInteger(address) || address < 0o27 || address > 0o217777 || address === last ||
            typeof value !== 'bigint' || value < 0n || value > WORD_MASK)
            throw new RangeError('Image word overlaps reader leader, is duplicated, unmapped, or out of range');
        if (address !== last + 1 || !chunks.length) chunks.push({ origin: address, words: [] });
        chunks.at(-1).words.push(value); last = address;
    }
    const entry = image.entry ?? sorted[0][0];
    if (!Number.isInteger(entry) || !sorted.some(([a]) => a === entry)) throw new RangeError('Tape entry must name a word in the image');
    const begin = [encodeInstruction({ op: 'OPR', config: 1, index: 0o52, address: 0o20000 }),
        encodeInstruction({ op: 'JMP', config: 0o14, address: entry })];
    const output = [...READER_LEADER_WORDS, ...createTapeBlock(0o27, begin, 3)];
    chunks.forEach((chunk, i) => output.push(...createTapeBlock(chunk.origin, chunk.words, i === chunks.length - 1 ? 0o27 : 3)));
    return Uint8Array.from(output.flatMap(w => Array.from(unsplayWord(w), frame => frame | marker)));
}
/** Parse without executing. Checks every header, checksum, continuation, range,
 * and frame count before returning words. No partial executable on failure. */
export function decodeBinaryTape(bytes, { requireLeader = true } = {}) {
    if (!(bytes instanceof Uint8Array) || bytes.length > 16000000 || bytes.length % 6)
        throw new RangeError('Tape must contain whole six-frame words, at most 16 MB');
    const words = [];
    for (let i = 0; i < bytes.length; i += 6) {
        let w = 0n; for (let j = 0; j < 6; j++) w = cycleAndSplay(w, bytes[i + j] & 63);
        words.push(w);
    }
    let cursor = 0;
    if (requireLeader) {
        for (let i = 0; i < READER_LEADER_WORDS.length; i++)
            if (words[i] !== READER_LEADER_WORDS[i]) throw new Error(`Reader leader mismatch at tape word ${i.toString(8)}`);
        cursor = READER_LEADER_WORDS.length;
    }
    const blocks = []; let complete = false;
    while (cursor < words.length) {
        if (complete) throw new Error('Trailing data after final tape block');
        const start = cursor, header = words[cursor++], count = 1 - Number(toSigned(leftHalf(header), 18));
        const end = Number(rightHalf(header)), origin = end - count + 1;
        if (count < 1 || origin < 0 || end > 0o377777 || cursor + count >= words.length)
            throw new Error(`Invalid/truncated block at tape word ${start.toString(8)}`);
        const body = words.slice(cursor, cursor + count); cursor += count;
        const trailer = words[cursor++], next = Number(rightHalf(trailer));
        if (!isZero(checksum([header, ...body, trailer]), 18)) throw new Error(`Checksum mismatch in block ${blocks.length}`);
        if (next > 0o377777) throw new Error('Marked continuation address is not supported');
        blocks.push({ origin, words: body, next, tapeWord: start });
        complete = next !== 3;
    }
    if (!blocks.length || !complete) throw new Error('Missing final tape block');
    return { format: 'tx2-reader-tape/1', blocks, next: blocks.at(-1).next, frameCount: bytes.length };
}
