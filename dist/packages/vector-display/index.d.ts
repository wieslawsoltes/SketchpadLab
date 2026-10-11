export interface Vec2 {x: number; y: number}
export class Camera {
  x: number; y: number; zoom: number; width: number; height: number;
  worldToScreen(point: Vec2): Vec2; screenToWorld(point: Vec2): Vec2;
  zoomAt(factor: number,point: Vec2): void; fit(bounds: {x: number; y: number; width: number; height: number},padding?: number): void;
}
export class VectorDisplay {
  constructor(canvas: HTMLCanvasElement,options?: {onBackend?: (backend: string)=>void; onError?: (message: string)=>void});
  canvas: HTMLCanvasElement; camera: Camera; backend: string; dpr: number; intensity: number; focus: number; monochrome: boolean; spots: boolean; phosphor: Phosphor;
  initialize(options?: {forceCanvas?: boolean}): Promise<this>;
  resize(width: number,height: number,dpr?: number): void;
  draw(segments: readonly {a: Vec2; b: Vec2; id: number; grid?: boolean}[],options?: {selected?: Set<number>; dim?: boolean; grid?: boolean}): void;
  dispose(): void;
}

export interface ScreenLine {a: Vec2; b: Vec2; alpha?: number}
/** Host display-list sampling and deterministic afterglow; not original display code. */
export class Phosphor {
 constructor(options?: {resolution?: number; persistence?: number; maxSpots?: number});
 resolution: number; persistence: number; maxSpots: number; time: number;
 lastFrame: ScreenLine[];
 clear(): void;
 frame(lines: readonly ScreenLine[],options: {width: number; height: number; time?: number; spots?: boolean}): ScreenLine[];
}
export function clipLine(x0: number,y0: number,x1: number,y1: number,maximum: number): [number,number,number,number]|null;

/** Two-Gaussian visual beam model shared with WGSL; not measured TX-2 photometry. */
export function beamEnergy(distance: number,options?: {focus?: number; scale?: number; intensity?: number}): number;
