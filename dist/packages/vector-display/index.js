import { beamEnergy } from './beam.js';
export { beamEnergy } from './beam.js';
import { Phosphor } from './phosphor.js';
export { Phosphor, clipLine } from './phosphor.js';
/** Browser vector renderer. Each segment is an analytic antialiased capsule;
 * independent WebGPU glow/core passes, no fake raster scanlines. */
export class Camera {
    constructor() { this.x = 0; this.y = 0; this.zoom = 1; this.width = 1; this.height = 1; }
    worldToScreen(p) { return { x: (p.x - this.x) * this.zoom + this.width / 2, y: (p.y - this.y) * this.zoom + this.height / 2 }; }
    screenToWorld(p) { return { x: (p.x - this.width / 2) / this.zoom + this.x, y: (p.y - this.height / 2) / this.zoom + this.y }; }
    zoomAt(factor, p) { const before = this.screenToWorld(p); this.zoom = Math.max(.02, Math.min(200, this.zoom * factor)); const after = this.screenToWorld(p); this.x += before.x - after.x; this.y += before.y - after.y; }
    fit(b, padding = 50) { this.x = b.x + b.width / 2; this.y = b.y + b.height / 2; this.zoom = Math.max(.02, Math.min((this.width - padding * 2) / b.width, (this.height - padding * 2) / b.height, 8)); }
}
const SHADER = `
struct Settings { viewport: vec2f, radius: f32, intensity: f32 };
@group(0) @binding(0) var<uniform> settings: Settings;
struct VertexOut { @builtin(position) position: vec4f, @location(0) local: vec2f, @location(1) length: f32, @location(2) color: vec4f };
@vertex fn vertex(@builtin(vertex_index) index: u32,@location(0) endpoints: vec4f,@location(1) color: vec4f) -> VertexOut {
  let positions=array<vec2f,6>(vec2f(0.,-1.),vec2f(1.,-1.),vec2f(0.,1.),vec2f(0.,1.),vec2f(1.,-1.),vec2f(1.,1.));
  let delta=endpoints.zw-endpoints.xy; let segmentLength=max(length(delta),0.0001); let tangent=select(delta/segmentLength,vec2f(1.,0.),length(delta)<0.0001); let normal=vec2f(-tangent.y,tangent.x);
  let uv=positions[index]; let along=mix(-settings.radius,segmentLength+settings.radius,uv.x);
  let p=endpoints.xy+tangent*along+normal*uv.y*settings.radius;
  var out: VertexOut; out.position=vec4f(p.x/settings.viewport.x*2.-1.,1.-p.y/settings.viewport.y*2.,0.,1.);
  out.local=vec2f(along,uv.y*settings.radius);out.length=segmentLength;out.color=color;return out;
}
@fragment fn fragment(in:VertexOut)->@location(0) vec4f {
  let distance=length(vec2f(max(max(-in.local.x,in.local.x-in.length),0.),in.local.y));
  let alpha=exp(-distance*distance/max(0.25,settings.radius*settings.radius*.13))*settings.intensity*in.color.a;
  return vec4f(in.color.rgb*alpha,alpha);
}`;
export class VectorDisplay {
    constructor(canvas, { onBackend = () => { }, onError = () => { } } = {}) { this.canvas = canvas; this.onBackend = onBackend; this.onError = onError; this.backend = 'initializing'; this.device = null; this.camera = new Camera(); this.dpr = 1; this.buffer = null; this.capacity = 0; this.dead = false; this.intensity = .9; this.monochrome = true; this.spots = true; this.phosphor = new Phosphor(); this._focus = 1; this.pointSprite = null; this.pointSpriteKey = null; }
    get focus() { return this._focus; }
    set focus(value) {
        if (!Number.isFinite(value) || value < .35 || value > 1.8) throw new RangeError('Beam focus must be 0.35..1.8');
        this._focus = value; this.pointSpriteKey = null;
    }
    sprite() {
        const key = `${this.dpr}:${this.focus}`;
        if (this.pointSpriteKey === key) return this.pointSprite;
        const radius = Math.ceil(5 * this.focus * this.dpr), size = radius * 2 + 1;
        const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d'), image = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const energy = beamEnergy(Math.hypot(x - radius, y - radius), { focus: this.focus, scale: this.dpr });
            const offset = (y * size + x) * 4;
            image.data[offset] = 227; image.data[offset + 1] = 240; image.data[offset + 2] = 255;
            image.data[offset + 3] = Math.round(255 * Math.min(1, energy));
        }
        ctx.putImageData(image, 0, 0);
        this.pointSprite = { canvas, radius }; this.pointSpriteKey = key;
        return this.pointSprite;
    }
    async initialize({ forceCanvas = false } = {}) {
        if (!forceCanvas && navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (!adapter)
                    throw new Error('No WebGPU adapter');
                const device = await adapter.requestDevice();
                this.device = device;
                const module = device.createShaderModule({ code: SHADER });
                const info = await module.getCompilationInfo();
                const errors = info.messages.filter(m => m.type === 'error');
                if (errors.length)
                    throw new Error(errors.map(e => e.message).join('\n'));
                const context = this.canvas.getContext('webgpu'), format = navigator.gpu.getPreferredCanvasFormat();
                if (!context)
                    throw new Error('WebGPU canvas context unavailable');
                this.context = context;
                this.format = format;
                context.configure({ device, format, alphaMode: 'opaque' });
                this.pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex', buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] }] }, fragment: { module, entryPoint: 'fragment', targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] }, primitive: { topology: 'triangle-list' } });
                this.uniforms = [0, 1].map(() => device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
                this.groups = this.uniforms.map(buffer => device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] }));
                device.lost.then(info => {
                    if (!this.dead) {
                        this.onError(`WebGPU device lost: ${info.message}`);
                        this.fallback(true);
                    }
                });
                this.backend = 'WebGPU';
                this.onBackend(this.backend);
                return this;
            }
            catch (e) {
                this.onError(e.message);
            }
        }
        this.fallback();
        return this;
    }
    fallback(replace = false) {
        // A canvas cannot switch context types after WebGPU is acquired.
        if (replace || this.context) {
            const old = this.canvas, next = old.cloneNode(false);
            old.replaceWith(next);
            this.canvas = next;
        }
        this.context = this.canvas.getContext('2d', { alpha: false });
        this.backend = 'Canvas 2D';
        this.onBackend(this.backend);
    }
    resize(width, height, dpr = Math.min(devicePixelRatio || 1, 2)) { this.camera.width = width; this.camera.height = height; this.dpr = dpr; this.canvas.width = Math.max(1, Math.round(width * dpr)); this.canvas.height = Math.max(1, Math.round(height * dpr)); }
    draw(segments, { selected = new Set(), dim = false, grid = false } = {}) {
        if (!this.context || this.dead)
            return;
        const width = this.canvas.width, height = this.canvas.height;
        let entries = [];
        if (grid) {
            const spacing = 50, z = this.camera.zoom, min = this.camera.screenToWorld({ x: 0, y: 0 }), max = this.camera.screenToWorld({ x: this.camera.width, y: this.camera.height });
            if (spacing * z > 8) {
                for (let x = Math.ceil(min.x / spacing) * spacing; x < max.x; x += spacing)
                    entries.push({ a: { x, y: min.y }, b: { x, y: max.y }, grid: true });
                for (let y = Math.ceil(min.y / spacing) * spacing; y < max.y; y += spacing)
                    entries.push({ a: { x: min.x, y }, b: { x: max.x, y }, grid: true });
            }
        }
        for (const segment of segments)
            entries.push(segment);
        let screenSpace = false;
        if (this.spots && this.monochrome) {
            entries = this.phosphor.frame(entries.map(s => ({ a: this.camera.worldToScreen(s.a), b: this.camera.worldToScreen(s.b), alpha: s.grid ? .15 : selected.has(s.id) ? 1 : .72 })), { width: this.camera.width, height: this.camera.height, time: performance.now() });
            screenSpace = true;
        }
        const data = new Float32Array(entries.length * 8);
        let n = 0;
        for (const s of entries) {
            const a = screenSpace ? s.a : this.camera.worldToScreen(s.a), b = screenSpace ? s.b : this.camera.worldToScreen(s.b);
            data.set([a.x * this.dpr, a.y * this.dpr, b.x * this.dpr, b.y * this.dpr, ...(this.monochrome ? [.89, .94, 1, s.alpha ?? (selected.has(s.id) ? 1 : .85)] : s.grid ? [.14, .24, .2, .18] : selected.has(s.id) ? [1, .8, .43, 1] : [.44, 1, .75, dim ? .4 : .9])], n++ * 8);
        }
        if (this.backend === 'WebGPU') {
            if (data.byteLength > this.capacity) {
                this.buffer?.destroy();
                this.capacity = Math.max(256, 2 ** Math.ceil(Math.log2(data.byteLength)));
                this.buffer = this.device.createBuffer({ size: this.capacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            }
            if (data.byteLength)
                this.device.queue.writeBuffer(this.buffer, 0, data);
            this.device.queue.writeBuffer(this.uniforms[0], 0, new Float32Array([width, height, 5 * this.focus * this.dpr, .2 * this.intensity]));
            this.device.queue.writeBuffer(this.uniforms[1], 0, new Float32Array([width, height, 1.7 * this.focus * this.dpr, .95 * this.intensity]));
            const encoder = this.device.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: this.monochrome ? { r: .006, g: .008, b: .008, a: 1 } : { r: .015, g: .036, b: .029, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
            if (entries.length) {
                pass.setPipeline(this.pipeline);
                pass.setVertexBuffer(0, this.buffer);
                for (let i = 0; i < 2; i++) {
                    pass.setBindGroup(0, this.groups[i]);
                    pass.draw(6, entries.length);
                }
            }
            pass.end();
            this.device.queue.submit([encoder.finish()]);
        }
        else {
            const ctx = this.context;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
            ctx.fillStyle = this.monochrome ? '#020303' : '#07110e';
            ctx.fillRect(0, 0, width, height);
            ctx.lineCap = 'round';
            const sprite = screenSpace ? this.sprite() : null;
            if (sprite) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowBlur = 0; }
            for (let i = 0; i < entries.length; i++) {
                const o = i * 8, r = data[o + 4] * 255, g = data[o + 5] * 255, b = data[o + 6] * 255, a = data[o + 7];
                if (sprite) {
                    ctx.globalAlpha = Math.min(1, Math.max(0, a * this.intensity));
                    ctx.drawImage(sprite.canvas, data[o] - sprite.radius, data[o + 1] - sprite.radius);
                    continue;
                }
                ctx.strokeStyle = `rgba(${r},${g},${b},${a * this.intensity})`;
                ctx.shadowColor = ctx.strokeStyle;
                ctx.shadowBlur = screenSpace ? 0 : entries[i].grid ? 0 : 4 * this.dpr;
                ctx.lineWidth = (entries[i].grid ? .5 : 1.15) * this.dpr;
                ctx.beginPath();
                ctx.moveTo(data[o], data[o + 1]);
                ctx.lineTo(data[o + 2], data[o + 3]);
                if (screenSpace || (data[o] === data[o + 2] && data[o + 1] === data[o + 3])) {
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.fillRect(data[o] - .42 * this.dpr, data[o + 1] - .42 * this.dpr, .84 * this.dpr, .84 * this.dpr);
                }
                else
                    ctx.stroke();
            }
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
    }
    dispose() { this.dead = true; this.buffer?.destroy(); this.uniforms?.forEach(b => b.destroy()); this.device?.destroy(); }
}
