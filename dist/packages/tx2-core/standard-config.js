import { quarter } from './word.js';
/** Published plugboard B configuration words (UH §5-5.2; TX-2 project transcription).
 * These are configuration data, not a claim that the complete boot ROM is emulated. */
export const CONFIGURATION_WORDS = Object.freeze([
    66631352320n, 35564545521n, 15058125065n, 17478509681n,
    63659651200n, 52334932443n, 28032881024n, 52133474523n
]);
export const STANDARD_CONFIGURATION = Uint16Array.from(CONFIGURATION_WORDS.flatMap(w => [0, 1, 2, 3].map(q => quarter(w, q))));
