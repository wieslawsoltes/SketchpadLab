/** Original-to-this-project single-stroke lettering. No font binaries or ROM data.
 * Coordinates use a five by seven design grid; each comma starts a pen-up run.
 * The shapes are an engineering approximation, not the recovered Sketchpad alphabet.
 */
const GLYPHS = Object.freeze({
    'A': '07 20 47,15 35', 'B': '07 00 30 41 42 33 03,33 44 46 37 07',
    'C': '40 10 01 06 17 47', 'D': '07 00 20 41 46 27 07', 'E': '40 00 07 47,03 33',
    'F': '07 00 40,03 33', 'G': '40 10 01 06 17 47 44 24', 'H': '00 07,40 47,03 43',
    'I': '00 40,20 27,07 47', 'J': '00 40 46 37 17 06', 'K': '00 07,40 03 47',
    'L': '00 07 47', 'M': '07 00 23 40 47', 'N': '07 00 47 40', 'O': '10 30 41 46 37 17 06 01 10',
    'P': '07 00 30 41 42 33 03', 'Q': '10 30 41 46 37 17 06 01 10,25 47',
    'R': '07 00 30 41 42 33 03,23 47', 'S': '40 10 01 02 13 33 44 46 37 07',
    'T': '00 40,20 27', 'U': '00 06 17 37 46 40', 'V': '00 27 40', 'W': '00 17 24 37 40',
    'X': '00 47,40 07', 'Y': '00 23 40,23 27', 'Z': '00 40 07 47',
    '0': '10 30 41 46 37 17 06 01 10,06 41', '1': '11 20 27,07 47',
    '2': '01 10 30 41 42 06 07 47', '3': '00 30 41 42 23 33 44 46 37 07',
    '4': '40 03 43,40 47', '5': '40 00 03 33 44 46 37 07', '6': '40 10 01 06 17 37 46 44 33 03',
    '7': '00 40 17', '8': '10 30 41 42 33 13 02 01 10,13 04 06 17 37 46 44 33',
    '9': '43 13 02 01 10 30 41 46 37 07',
    ' ': '', '-': '03 43', '+': '03 43,20 26', '=': '02 42,05 45', '.': '27 27', ',': '26 17',
    ':': '22 22,25 25', ';': '22 22,25 16', '/': '07 40', '\\': '00 47', '(': '30 11 16 37',
    ')': '10 31 36 17', '[': '30 10 17 37', ']': '10 30 37 17', '<': '41 03 46', '>': '01 43 06',
    '_': '07 47', '!': '20 25,27 27', '?': '01 10 30 41 42 23 25,27 27',
    '*': '02 44,42 04,20 26', '"': '10 12,30 32', "'": '20 22',
    '#': '10 17,30 37,02 42,05 45', '%': '00 10 11 01 00,07 40,36 46 47 37 36',
    '°': '10 20 31 22 12 01 10', '|': '20 27', '~': '03 12 32 43',
    'Δ': '07 20 47 07', 'α': '44 33 13 04 06 17 37 44 47', 'β': '07 00 30 41 42 23 33 44 46 37 17',
    'π': '02 42,12 17,32 37', '×': '01 46,41 06', '±': '02 42,20 24,06 46'
});
const paths = new Map();
export function glyphStrokes(character) {
    const key = GLYPHS[character] !== undefined ? character : character.toUpperCase();
    if (paths.has(key))
        return paths.get(key);
    const text = GLYPHS[key] ?? GLYPHS['?'];
    const result = Object.freeze(text ? text.split(',').map(run => Object.freeze(run.split(' ').map(pair => Object.freeze([Number(pair[0]), Number(pair[1])])))) : []);
    paths.set(key, result);
    return result;
}
export function strokeText(text, { x = 0, y = 0, size = 18, angle = 0, id = null, matrix = null } = {}) {
    if (typeof text !== 'string' || text.length > 10000 || !Number.isFinite(size) || size <= 0)
        throw new TypeError('Invalid stroke lettering');
    const c = Math.cos(angle), s = Math.sin(angle), m = matrix ?? [c, s, -s, c, x, y], unit = size / 7, segments = [];
    let column = 0, line = 0;
    const point = (p) => { const u = (column * 6 + p[0]) * unit, v = (line * 10 + p[1] - 7) * unit; return { x: m[0] * u + m[2] * v + m[4], y: m[1] * u + m[3] * v + m[5] }; };
    for (const ch of text) {
        if (ch === '\n') {
            line++;
            column = 0;
            continue;
        }
        for (const run of glyphStrokes(ch))
            for (let i = 1; i < run.length; i++)
                segments.push({ a: point(run[i - 1]), b: point(run[i]), id, type: 'text' });
        column++;
    }
    return segments;
}
