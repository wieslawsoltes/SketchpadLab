/** Exact TX-2 word primitives and instruction-level research emulator. */
export type Integer = bigint | number | string;
export const WORD_BITS: 36;
export const WORD_MASK: bigint;
export const HALF_MASK: bigint;
export const ADDRESS_MASK: number;
export const NEGATIVE_ZERO: bigint;
export function maskFor(bits: number): bigint;
export function word(value: Integer): bigint;
export function half(value: Integer): bigint;
export function signBit(bits: number): bigint;
export function isNegative(value: Integer, bits?: number): boolean;
export function isZero(value: Integer, bits?: number): boolean;
export function fromSigned(value: Integer, bits?: number, negativeZero?: boolean): bigint;
export function toSigned(value: Integer, bits?: number): bigint;
export function addOnes(a: Integer, b: Integer, bits?: number): bigint;
export function subtractOnes(a: Integer, b: Integer, bits?: number): bigint;
export function arithmeticResult(a: Integer, b: Integer, bits?: number, subtract?: boolean): {value: bigint; overflow: boolean};
export function rotate(value: Integer, count: number, bits?: number): bigint;
export function quarter(value: Integer, index: number): number;
export function putQuarter(value: Integer, index: number, quarter: Integer): bigint;
export function leftHalf(value: Integer): bigint;
export function rightHalf(value: Integer): bigint;
export function joinHalves(left: Integer, right: Integer): bigint;
export function formatOctal(value: Integer, digits?: number): string;
export function parseOctal(text: string, bits?: number): bigint;
export function parity(value: Integer): number;
export function checkedAddress(value: Integer): number;
export function indexAddress(address: Integer, index: Integer): number;
/** Raw six-bit frames, not historical paper-tape framing or a boot loader. */
export function encodeSixBitWords(words: readonly Integer[]): Uint8Array;
export function decodeSixBitWords(bytes: Uint8Array): bigint[];
export type OpcodeName = 'OPR'|'JMP'|'JPX'|'JNX'|'AUX'|'RSX'|'SKX'|'EXX'|'ADX'|'DPX'|'SKM'|'LDE'|'SPF'|'SPG'|'LDA'|'LDB'|'LDC'|'LDD'|'STE'|'FLF'|'FLG'|'STA'|'STB'|'STC'|'STD'|'ITE'|'ITA'|'UNA'|'SED'|'JOV'|'JPA'|'JNA'|'EXA'|'INS'|'COM'|'TSD'|'CYA'|'CYB'|'CAB'|'NOA'|'DSA'|'NAB'|'ADD'|'SCA'|'SCB'|'SAB'|'TLY'|'DIV'|'MUL'|'SUB';
export type AliasName = 'IOS'|'AOP'|'BRC'|'JPS'|'BRS'|'JPQ'|'BPQ'|'JES'|'JPD'|'BRD'|'JDS'|'BDS'|'REX'|'INX'|'DEX'|'SXD'|'SXL'|'SXG'|'RXF'|'RXD'|'RFD'|'SUC'|'SUZ'|'SUN'|'SZC'|'SZZ'|'SZN'|'SNC'|'SNZ'|'SNN'|'MCR'|'MZR'|'MNR'|'SUR'|'SZR'|'SNR'|'MKZ'|'MKN'|'MKC'|'SKZ'|'SKN'|'SKU'|'CYR';
export const OPCODES: Readonly<Record<OpcodeName, number>>;
export const NAMES: Readonly<Record<number, OpcodeName>>;
export const ALIASES: Readonly<Record<AliasName, {op: OpcodeName; config?: number; forceOperand?: number}>>;
export const IMPLICIT_HOLD: Set<OpcodeName>;
export interface InstructionFields {op: OpcodeName | AliasName | number; config?: number; index?: number; address?: number; defer?: boolean; hold?: boolean}
export interface DecodedInstruction {word: bigint; op: OpcodeName | '???'; opcode: number; hold: boolean; config: number; index: number; defer: boolean; address: number}
export function encodeInstruction(fields: InstructionFields): bigint;
export function decodeInstruction(value: Integer): DecodedInstruction;
export function disassemble(value: Integer): string;
export function encodeBitSelector(quarterNumber: number, bitNumber: number): number;
export function decodeBitSelector(index: number): {quarter: number; bit: number; mask: bigint; wordBit: number|null; meta: boolean; parity: boolean};
export interface Configuration {value: number; permutation: number; activity: number; fracture: number}
export const CONFIGURATION_WORDS: readonly bigint[];
export const STANDARD_CONFIGURATION: Uint16Array;
export function describeConfiguration(value: number): Configuration;
export function subwords(fracture: number): {offset: number; bits: number}[];
export function signExtend(value: Integer, activity: number, fracture: number): bigint;
export function exchangeLoad(configuration: number, memory: Integer, existing?: Integer): bigint;
export function exchangeLoadWithoutSignExtension(configuration: number, memory: Integer, existing?: Integer): bigint;
export function exchangeStore(configuration: number, register: Integer, existing?: Integer): bigint;
export function fracturedArithmetic(configuration: number, a: bigint, b: bigint, subtract?: boolean): {value: bigint; overflow: boolean};
export type RegisterName = 'A'|'B'|'C'|'D'|'E';
export const REGISTERS: Readonly<Record<RegisterName, number>>;
export class MachineFault extends Error {constructor(code: string, message: string, details?: Record<string, unknown>); code: string; details: Record<string, unknown>}
export type ReferencePhase = 'execute'|'defer'|'operand'|'register';
export interface MemoryAccess {kind: 'read'|'write'|'execute'; phase: ReferencePhase; address: number; value: bigint; meta: boolean}
export type MemoryDelta = [number, [bigint, number, number]][];
export interface MemorySnapshot {data: BigUint64Array; meta: Uint8Array; parityBits: Uint8Array}
export class Memory {
  constructor(options?: {withU?: boolean});
  withU: boolean; data: BigUint64Array; meta: Uint8Array; parityBits: Uint8Array;
  onAccess: ((access: MemoryAccess)=>void)|null;
  mapped(address: number): boolean; address(address: number): number; metaAddress(address: number): number;
  peek(address: number): bigint; read(address: number, kind?: MemoryAccess['kind'], phase?: ReferencePhase): bigint;
  write(address: number, value: Integer, phase?: ReferencePhase): void; poke(address: number, value: Integer): void;
  getMeta(address: number): boolean; setMeta(address: number, value: boolean): void;
  begin(): void; commit(): MemoryDelta; rollback(delta?: MemoryDelta|null): void;
  injectParityError(address: number): void; mapRead(address: number, read: ()=>Integer): void;
  snapshot(): MemorySnapshot; restore(snapshot: MemorySnapshot): void;
}
export interface PenState {x: number; y: number; down: boolean}
export interface InputSnapshot {buttonMeta: boolean; toggles: bigint[]; buttons: bigint; knobs: bigint; ticks: bigint; pen: PenState; events: Record<string, unknown>[]}
export class ConsoleInputs {
  buttonMeta?: boolean; toggles: bigint[]; events: Record<string,unknown>[]; buttons: bigint; knobs: bigint; ticks: bigint; pen: PenState;
  attach(memory: Memory): void; button(quarter: number, bit: number, pressed: boolean): void;
  knob(quarter: number, value: Integer): void; setPen(x: number, y: number, down: boolean): void;
  setToggle(address: number,value: Integer): void;
  snapshot(): InputSnapshot; restore(snapshot: InputSnapshot): void;
}
export interface WordDevice {write(value: bigint): void; snapshot(): unknown; restore(snapshot: unknown): void}
export class WordTape {
  constructor(words?: readonly Integer[]); words: bigint[]; position: number; output: bigint[];
  read(): bigint|null; write(value: Integer): void;
  snapshot(): {position: number; output: bigint[]}; restore(snapshot: {position: number; output: bigint[]}): void;
}
export class DiagnosticVectorDevice {
  points: {x: number; y: number}[]; limit: number; write(value: bigint): void;
  snapshot(): {x: number; y: number}[]; restore(snapshot: {x: number; y: number}[]): void;
}
export interface SourceLocation {file: string; line: number; text: string; stack?: string[]; start?: number; end?: number}
export interface LoadableImage {words: [number, bigint][]; entry?: number; sourceMap?: Map<number, SourceLocation>; diagnostics?: {severity: string}[]}
export type MachineProfile = 'strict'|'diagnostic-word-io'|'tx2-io-research';
export interface Fault {code: string; message: string; P: number}
export interface MachineState {previousHold: boolean; overflowFlags: number; virtualTime: number; limbo: boolean; TSP: number; dismissed: boolean; io?: IOSnapshot; P: number; Q: number; K: number; N: bigint; X: BigUint64Array; F: Uint16Array; flags: bigint; cycles: number; overflow: boolean; stopped: boolean; reason: string; fault: Fault|null; inputs: InputSnapshot; devices: [number, unknown][]}
export interface MachineSnapshot {format: 'tx2-lab-snapshot/1'; profile: MachineProfile; state: MachineState; memory: MemorySnapshot; media?: {petr: Uint8Array}}
export interface HistoryEntry {kind?: 'instruction'|'boundary'; pc: number; word: bigint; text: string; before: MachineState; delta: MemoryDelta; accesses: MemoryAccess[]}
export type StepResult = {ok: true; pc: number; instruction: DecodedInstruction; accesses: MemoryAccess[]; reason: string} | {ok: false; error: Fault; pc: number};
export const SUPPORTED_OPERATIONS: readonly OpcodeName[];
export class TX2 {
  constructor(options?: {profile?: MachineProfile; historyLimit?: number; memory?: Memory});
  profile: MachineProfile; memory: Memory; inputs: ConsoleInputs; devices: Map<number, WordDevice>;
  io: TX2IOBus|null; priorities: number[]; previousHold: boolean; overflowFlags: number; virtualTime: number; limbo: boolean; TSP: number; dismissed: boolean;
  P: number; Q: number; K: number; N: bigint; X: BigUint64Array; F: Uint16Array; flags: bigint;
  cycles: number; overflow: boolean; stopped: boolean; reason: string; fault: Fault|null;
  breakpoints: Set<number>; watchpoints: Map<number, string>; history: HistoryEntry[];
  trace: {pc: number; word: bigint; text: string; cycle: number; kind?: 'instruction'|'boundary'}[];
  reset(options?: {clearMemory?: boolean}): void; load(image: LoadableImage): void;
  /** Mount a tape and start at the published plugboard without preloading user RAM. */
  bootTape(frames: Uint8Array): void;
  advanceP(delta: number): void; jumpP(address: number): void;
  getRegister(name: RegisterName): bigint; setRegister(name: RegisterName, value: Integer): void;
  state(): MachineState; restoreState(state: MachineState): void;
  step(): StepResult; run(options?: {budget?: number; ignoreInitialBreakpoint?: boolean}): {executed: number; reason: string; P: number};
  raiseFlag(unit: number): void; lowerFlag(unit: number): void; schedule(all?: boolean): void; dismiss(instruction: DecodedInstruction, force?: boolean): void;
  back(): boolean; snapshot(): MachineSnapshot; restore(snapshot: MachineSnapshot): void;
}

export interface AERegisters {A: bigint; B: bigint; C: bigint; D: bigint; E: bigint}
export function activeSubwords(configuration: number): {offset: number; bits: number}[];
export function activeWordMask(configuration: number, quartersOnly?: boolean): bigint;
export function addWithCarries(a: bigint,b: bigint,bits?: number,subtract?: boolean): {value: bigint; carries: bigint; overflow: boolean};
export function arithmeticElement(op: OpcodeName,configuration: number,operand: bigint,registers: AERegisters,overflowFlags?: number): AERegisters & {overflowFlags: number};
/** Six data bits are splayed across each 36-bit word. Framing/control is separate. */
export function cycleAndSplay(target: bigint,frame: number): bigint;
export function unsplayWord(value: Integer): Uint8Array;
export interface ScopeSpot {x: number; y: number; time: number; intensity: number; dwell: number}
export interface DeviceSnapshot {connected: boolean; mode: number; readyAt: number|null; ready: boolean; missed: boolean; [key: string]: unknown}
export interface TransferResult {value?: bigint; spot?: ScopeSpot; raise?: number}
export interface IODevice {
 connected: boolean; mode: number; readyAt: number|null; ready: boolean; missed: boolean; output: boolean;
 reset(): void; connect(mode: number,time: number): boolean; disconnect(): void; poll(time: number): boolean;
 transfer?(value: bigint,time: number): TransferResult|null;
 snapshot(): DeviceSnapshot; restore(snapshot: DeviceSnapshot): void;
}
export class TX2Scope implements IODevice {
 connected: boolean; mode: number; readyAt: number|null; ready: boolean; missed: boolean; output: boolean;
 readonly points: ScopeSpot[];
 reset(): void; connect(mode: number,time: number): boolean; disconnect(): void; poll(time: number): boolean;
 transfer(value: bigint,time: number): {spot: ScopeSpot}|null;
 snapshot(): DeviceSnapshot; restore(snapshot: DeviceSnapshot): void;
}
export class TX2LightPen implements IODevice {
 connected: boolean; mode: number; readyAt: number|null; ready: boolean; missed: boolean; output: boolean;
 position: {x: number; y: number; down: boolean; radius: number};
 reset(): void; connect(mode: number,time: number): boolean; disconnect(): void; poll(time: number): boolean;
 setPosition(x: number,y: number,down?: boolean,radius?: number): void; illuminate(spot: ScopeSpot): boolean;
 snapshot(): DeviceSnapshot; restore(snapshot: DeviceSnapshot): void;
}
export class TX2PaperTapeReader implements IODevice {
 constructor(options?: {framesPerSecond?: number});
 connected: boolean; mode: number; readyAt: number|null; ready: boolean; missed: boolean; output: boolean;
 frames: Uint8Array; position: number; period: number; buffer: number|null;
 direction: 'bin'|'reel'; reverseAt: number|null; motor: boolean;
 reset(): void; mount(frames: Uint8Array): void; connect(mode: number,time: number): boolean; disconnect(): void; poll(time: number): boolean;
 transfer(target: bigint,time: number): {value: bigint}|null;
 snapshot(): DeviceSnapshot; restore(snapshot: DeviceSnapshot): void;
}
export class TX2PaperTapePunch implements IODevice {
 connected: boolean; mode: number; readyAt: number|null; ready: boolean; missed: boolean; output: boolean;
 readonly outputFrames: Uint8Array;
 reset(): void; connect(mode: number,time: number): boolean; disconnect(): void; poll(time: number): boolean;
 transfer(value: bigint,time: number): {value: bigint}|null;
 snapshot(): DeviceSnapshot; restore(snapshot: DeviceSnapshot): void;
}
export type IOSnapshot = [number,DeviceSnapshot][];
export class TX2IOBus {
 devices: Map<number,IODevice>;
 reset(): void; require(unit: number): IODevice; poll(time: number): number[]; nextDeadline(): number;
 report(unit: number,flags: bigint): bigint; connect(unit: number,mode: number,time: number): boolean;
 disconnect(unit: number): void; transfer(unit: number,value: bigint,time: number): TransferResult|null;
 snapshot(): IOSnapshot; restore(snapshot: IOSnapshot): void;
}

/** Instruction-boundary research TRAP circuit; mode values use octal notation. */
export const TRAP_UNIT: 34;
export const TRAP_MODES: Readonly<{instruction: number; defer: number; operand: number; sequence: number; markInstruction: number; markDefer: number; markOperand: number}>;
export interface TrapEvent {phase: 'execute'|'defer'|'operand'|'sequence'; address: number; sequence: number; time: number}
export interface TrapSnapshot extends DeviceSnapshot {markingDisabled: boolean; count: number; last: TrapEvent|null}
export class TrapCircuit implements IODevice {
 connected: boolean; mode: number; readyAt: number|null; ready: boolean; missed: boolean; output: boolean;
 markingDisabled: boolean; count: number; last: Readonly<TrapEvent>|null;
 reset(): void; connect(mode: number,time?: number): boolean; disconnect(): void; poll(time?: number): boolean;
 transfer(value: bigint,time?: number): {value: bigint};
 access(phase: ReferencePhase,marked: boolean,address: number,sequence: number,time: number): {mark: boolean; raise: boolean};
 intercept(previousSequence: number,nextSequence: number,placekeeper: bigint,time: number): boolean;
 snapshot(): TrapSnapshot; restore(snapshot: DeviceSnapshot): void;
}
/** Published ROM data and reader leader, not a recovered Sketchpad executable. */
export const PLUGBOARD_BASE: number;
export const CONFIG_BOOT_ENTRY: number;
export const READER_BOOT_ENTRY: number;
export const PLUGBOARD_WORDS: readonly bigint[];
export const READER_LEADER_WORDS: readonly bigint[];
