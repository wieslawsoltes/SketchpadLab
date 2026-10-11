import type {SourceLocation, LoadableImage} from '../tx2-core/index.js';
export interface Diagnostic {severity: 'error'; file: string; line: number; column?: number; code: string; message: string}
export interface AssemblyOptions {filename?: string; includes?: Record<string, string>; dialect?: 'auto'|'explicit'|'m4'; autoAssign?: boolean; zeroDivision?: 'error'|'zero'}
export interface AssemblyImage extends LoadableImage {
  format?: 'tx2-lab-image/1'; entry: number; words: [number,bigint][];
  symbols: Map<string,bigint>; sourceMap: Map<number,SourceLocation>; diagnostics: Diagnostic[];
  listing: {address: number; word: bigint; file: string; line: number; text: string}[];
  stats?: {sourceLines: number; expandedLines: number; wordCount: number; symbolCount: number};
  dialect?: string; warnings?: {file: string; line: number; message: string}[]; commands?: Record<string,unknown>[];
}
/** Bounded explicit and native M4 restoration dialects. Full archival compatibility is not verified. */
export class Assembler {
  constructor(options?: {maxSourceBytes?: number; maxExpandedLines?: number; maxMacroDepth?: number});
  assemble(source: string, options?: AssemblyOptions): AssemblyImage;
}
export function assemble(source: string, options?: AssemblyOptions): AssemblyImage;
export function normalizeSourceLine(line: string): string;
export function serializeImage(image: AssemblyImage): string;
export function deserializeImage(json: string): AssemblyImage;
export class ExpressionError extends Error {constructor(message: string, column?: number); column: number}
export interface ExpressionToken {type: 'number'|'id'|'here'|'op'|'end'; value: string; column: number}
export function tokenizeExpression(source: string): ExpressionToken[];
export function evaluate(source: string, options?: {here?: bigint|number; resolve?: (name: string)=>bigint|number}): bigint;

export class M4Assembler {
 constructor(options?: {maxSourceBytes?: number; maxExpandedLines?: number; maxMacroDepth?: number});
 assemble(source: string,options?: AssemblyOptions): AssemblyImage;
}
export function assembleM4(source: string,options?: AssemblyOptions): AssemblyImage;
export function normalizeM4(source: string): string;
export function m4CommaTransform(leading: number,value: bigint,trailing: number): bigint;
export function evaluateM4(source: string,options?: {here?: number|bigint; radix?: number; resolve?: (name: string,kind?: string)=>bigint; maxDepth?: number; zeroDivision?: 'error'|'zero'}): bigint;

export interface SourceAnnotation {kind: 'metadata'|'editorial'; start: number; end: number; text: string}
export interface SourceLine {file: string; line: number; start: number; end: number; text: string; code: string}
export interface SourceView {source: string; code: string; lines: SourceLine[]; annotations: SourceAnnotation[]}
/** A parsing-only view that preserves UTF-16 source offsets and original bytes in the caller. */
export function scanAssemblySource(source: string,options?: {filename?: string; semicolonComments?: boolean}): SourceView;
export interface TapeBlock {origin: number; words: bigint[]; next: number; tapeWord: number}
export interface DecodedTape {format: 'tx2-reader-tape/1'; blocks: TapeBlock[]; next: number; frameCount: number}
export function createTapeBlock(origin: number,words: bigint[],next?: number): bigint[];
/** Binary reader-leader file. High bits are optional file markers, not CPU data. */
export function encodeBinaryTape(image: LoadableImage,options?: {marker?: 0|64|128}): Uint8Array;
export function decodeBinaryTape(bytes: Uint8Array,options?: {requireLeader?: boolean}): DecodedTape;
