export interface OriginalEntry {name: string; bytes: number; blob: string; repository: string; description: string}
export const ORIGINALS: readonly OriginalEntry[];
export interface Verification {verified: boolean; digest: string; expected: string; bytes: number}
export function gitBlobHash(bytes: Uint8Array): Promise<string>;
export function verifyOriginal(bytes: Uint8Array, entry: OriginalEntry): Promise<Verification>;
export function fetchOriginal(entry: OriginalEntry, options?: {signal?: AbortSignal}): Promise<{entry: OriginalEntry; bytes: Uint8Array; verification: Verification; source: string}>;
export function auditListing(source: string): {lines: number; archivalPageRecords: number; macroDefinitions: number; glyphKinds: number; equalityNames: number; duplicateEqualities: {name: string; line: number; previous: number}[]; uncertainAnnotations: {line: number; text: string}[]};
