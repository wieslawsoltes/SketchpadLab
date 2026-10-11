export interface Vec2 {x: number; y: number}
export type Matrix = readonly [number,number,number,number,number,number];
export const IDENTITY: Matrix;
export function multiply(a: Matrix,b: Matrix): Matrix;
export function transform(matrix: Matrix, point: Vec2): Vec2;
export interface Point extends Vec2 {id: number; picture: number; fixed: boolean; tie: boolean}
export interface Picture {id: number; name: string; number?: number}
export interface Scalar {id: number; picture: number; value: number; fixed: boolean}
export interface EntityBase {id: number; picture: number}
export interface Line extends EntityBase {type: 'line'; a: number; b: number}
export interface Circle extends EntityBase {type: 'circle'; center: number; edge: number}
export interface Arc extends EntityBase {type: 'arc'; center: number; start: number; end: number; ccw: boolean}
export interface TextEntity extends EntityBase {type: 'text'; position: number; text: string; size: number; angle?: number}
export interface Instance extends EntityBase {type: 'instance'; master: number; matrix: Matrix; fixed?: boolean}
export interface NumberEntity extends EntityBase {type: 'number'; position: number; scalar: number; size: number; digits: number; decimals: number; angle?: number}
export type Entity = Line|Circle|Arc|TextEntity|Instance|NumberEntity;
export function pointReferences(entity: Entity): number[];
export type ConstraintType = 'horizontal'|'vertical'|'distance'|'coincident'|'fixed'|'parallel'|'perpendicular'|'equalLength'|'lengthRatio'|'pointOnLine'|'pointOnCircle'|'midpoint'|'radius'|'equalRadius'|'arcRadius'|'tangent'|'angle'|'direction'|'instancePoint'|'instanceScale'|'instanceAngle'|'scalarDistance'|'scalarLength'|'scalarRadius'|'scalarEqual'|'scalarRatio'|'scalarDifference'|'scalarTarget';
export const CONSTRAINT_TYPES: readonly ConstraintType[];
export interface Constraint {id: number; picture: number; type: ConstraintType; refs: number[]; value?: number; x?: number; y?: number; disabled?: boolean; masterPoint?: number; measureScale?: number}
export interface SolveOptions {picture?: number; pins?: Map<number,Vec2>; instancePins?: Map<number,Matrix>; maxIterations?: number; tolerance?: number}
export interface SolveResult {converged: boolean; iterations: number; cost: number; maxResidual: number; variables: number; equations: number; rank: number|null; degreesOfFreedom: number|null; residualByConstraint: Map<number,number>}
export function solveConstraints(document: SketchDocument, options?: SolveOptions): SolveResult;
export class RingArena {
  constructor(capacity?: number); capacity: number; count: number;
  next: Uint32Array; prev: Uint32Array; owner: Uint32Array; value: Uint32Array; alive: Uint8Array; anchor: Uint8Array;
  create(): number; insert(anchor: number, value: number, before?: number): number;
  remove(node: number): void; check(node: number): void;
  nodes(anchor: number): Generator<number>; values(anchor: number): Generator<number>; validate(): true;
}
export class SketchDocument {
  nextId: number; currentPicture: number; points: Map<number,Point>; entities: Map<number,Entity>;
  scalars: Map<number,Scalar>; pictures: Map<number,Picture>; constraints: Map<number,Constraint>; lastSolve: SolveResult|null;
  history: {label: string; before: string; after: string}[]; future: {label: string; before: string; after: string}[];
  rings: RingArena; pictureRings: Map<number,number>; pointRings: Map<number,number>; constraintRings: Map<number,number>;
  id(): number; picture(name: string): number;
  point(x: number,y: number,options?: {picture?: number; fixed?: boolean; tie?: boolean}): number;
  entity(type: Entity['type'], properties?: Record<string,unknown>): number;
  line(a: number,b: number): number; circle(center: number,edge: number): number;
  arc(center: number,start: number,end: number): number; text(position: number,text?: string,size?: number): number;
  constraint(type: ConstraintType,refs: readonly number[],extra?: {picture?: number; value?: number; x?: number; y?: number; disabled?: boolean; masterPoint?: number; measureScale?: number}): number;
  instance(master: number,x: number,y: number,scale?: number,angle?: number): number;
  scalar(value?: number,options?: {picture?: number; fixed?: boolean}): number;
  number(position: number,scalar?: number,options?: {size?: number; digits?: number; decimals?: number}): number;
  attachInstance(instanceId: number,masterPoint: number,hostPoint?: number|null): number;
  instanceAttachers(instanceId: number): {masterPoint: number; point: number; constraint: number}[];
  changeInstance(id: number,master: number): number;
  copyDefinition(master: number,options?: {x?: number; y?: number; targets?: number[]}): number[];
  reaches(from: number,target: number,seen?: Set<number>): boolean;
  onChange(listener: (event: {label: string; document: SketchDocument})=>void): ()=>boolean;
  changed(label: string): void; beginEdit(label: string): void; endEdit(): void; cancelEdit(): void;
  transaction<T>(label: string,action: ()=>T,options?: {solve?: boolean}): T;
  undo(): boolean; redo(): boolean; solve(options?: SolveOptions): SolveResult;
  serialize(): string; restore(json: string|unknown): void; validate(): true; rebuildRings(): void;
  remove(ids: readonly number[]): void; garbageCollect(): void; mergePoints(source: number,target: number): void;
  createMaster(ids: readonly number[],name?: string): number; explode(instance: number): number[];
}
export interface Segment {a: Vec2; b: Vec2; id: number; type?: Entity['type']; grid?: boolean}
export interface TextLabel {id: number; p: Vec2; text: string; size: number; sourceSize: number; matrix: Matrix}
export interface FlattenedPicture {segments: Segment[]; labels: TextLabel[]; handles: Point[]}
export function flatten(document: SketchDocument,picture?: number,options?: {matrix?: Matrix; depth?: number; root?: number|null}): FlattenedPicture;
export function distanceToSegment(point: Vec2,a: Vec2,b: Vec2): number;
export function hitTest(document: SketchDocument,point: Vec2,radius?: number,options?: {includePoints?: boolean}): {kind: 'point'|'entity'; id: number; distance: number}|null;
export function bounds(document: SketchDocument): {x: number; y: number; width: number; height: number};
export function exportSVG(document: SketchDocument): string;

export function formatNumber(value: number,options?: {digits?: number; decimals?: number}): string;
export function displaySegments(document: SketchDocument,options?: {matrix?: Matrix; depth?: number; root?: number|null}): Segment[];
export function glyphStrokes(character: string): readonly (readonly (readonly [number,number])[])[];
export function strokeText(text: string,options?: {x?: number; y?: number; size?: number; angle?: number; id?: number|null; matrix?: Matrix|null}): {a: Vec2; b: Vec2; id: number|null; type: 'text'}[];
export type PlotOrder = 'nearest'|'source'|'worst';
export interface PlotPlan {paths: Vec2[][]; penUpDistance: number; penDownDistance: number; segments: number; order: PlotOrder}
export function planPlot(document: SketchDocument,options?: {tolerance?: number; order?: PlotOrder; maxSegments?: number}): PlotPlan;
/** Modern HP-GL, not a historical TX-2 plotter tape. */
export function exportHPGL(document: SketchDocument,options?: {unitsPerUnit?: number; order?: PlotOrder}): string;
export class SketchpadController {
 constructor(document: SketchDocument,options?: {radius?: ()=>number; onChange?: ()=>void; onSelection?: (ids: number[])=>void; onRequest?: (request: string,value?: unknown)=>void; onStatus?: (message: string)=>void});
 document: SketchDocument; pen: Vec2 & {tracking: boolean}; meta: boolean; hold: boolean; selected: number[]; designated: number[]; toggles: Map<number,bigint>; plotOrder: PlotOrder;
 setDocument(document: SketchDocument): void; setPen(x: number,y: number,tracking?: boolean): void;
 select(ids: number[]): void; dispatch(action: string): unknown; stop(options?: {clearCenter?: boolean}): void;
 cancel(): void; flick(): void; type(character: string): void;
 pictureNumber(number: number): number|undefined;
}
