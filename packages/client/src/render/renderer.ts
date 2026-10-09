import { compile, texture, uniforms } from './gl.ts';
import type { Camera } from './camera.ts';
import { CHUNK, ENT_STRIDE, META_STRIDE, type ChunkPatch } from '@sotv/sim';
import { ATLAS_SIZE, TILE } from '../assets/atlas.ts';

const WORLD_VS = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const WORLD_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uT0;
uniform sampler2D uT1;
uniform sampler2D uLut;
uniform sampler2D uAtlas;
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uView;
uniform vec2 uWorld;
uniform float uTime;
uniform float uDay;
uniform int uOverlay;
uniform int uQuality;
uniform float uCloud;
uniform vec4 uBrush;
uniform float uSeasonTint;
out vec4 outColor;

const float TILE = ${TILE.toFixed(1)};
const float ATLAS = ${ATLAS_SIZE.toFixed(1)};

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }

vec4 lut(int row, int idx){ return texelFetch(uLut, ivec2(idx, row), 0); }
vec4 tile(float t, vec2 f){
  float col = mod(t, ATLAS / TILE);
  float row = floor(t / (ATLAS / TILE));
  vec2 px = (vec2(col, row) * TILE + clamp(f, 0.0, 0.999) * TILE);
  return texelFetch(uAtlas, ivec2(px), 0);
}
ivec4 fetch0(ivec2 c){ return ivec4(texelFetch(uT0, clamp(c, ivec2(0), ivec2(uWorld) - 1), 0) * 255.0 + 0.5); }
ivec4 fetch1(ivec2 c){ return ivec4(texelFetch(uT1, clamp(c, ivec2(0), ivec2(uWorld) - 1), 0) * 255.0 + 0.5); }

vec3 heatColor(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 a = mix(vec3(0.1,0.1,0.6), vec3(0.1,0.8,0.9), smoothstep(0.0,0.25,t));
  a = mix(a, vec3(0.2,0.8,0.2), smoothstep(0.2,0.35,t));
  a = mix(a, vec3(1.0,0.9,0.1), smoothstep(0.35,0.5,t));
  a = mix(a, vec3(1.0,0.3,0.0), smoothstep(0.5,0.75,t));
  return mix(a, vec3(1.0,1.0,1.0), smoothstep(0.85,1.0,t));
}

void main(){
  vec2 sp = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  vec2 wp = uCam + (sp - uView * 0.5) / uZoom;
  if (wp.x < 0.0 || wp.y < 0.0 || wp.x >= uWorld.x || wp.y >= uWorld.y) { outColor = vec4(0.04,0.05,0.08,1.0); return; }
  ivec2 c = ivec2(floor(wp));
  vec2 f = fract(wp);
  ivec4 a = fetch0(c);
  ivec4 b = fetch1(c);
  int biome = a.r & 127;
  bool road = (a.r & 128) != 0;
  float h = float(a.g);
  int mat = a.b;
  float depth = float(a.a);
  int obj = b.r;
  int stage = b.g & 15;
  int fire = b.g >> 4;
  int owner = b.b;
  float temp = float(b.a) - 50.0;
  bool detailed = uZoom >= 3.0 && uQuality > 0;

  vec3 col;
  float v = hash(vec2(c));
  if (detailed) {
    int tb = biome;
    if (uQuality > 0) {
      vec2 e = f - 0.5;
      ivec2 dir = abs(e.x) > abs(e.y) ? ivec2(sign(e.x), 0) : ivec2(0, sign(e.y));
      float edgeDist = 0.5 - max(abs(e.x), abs(e.y));
      int nb = fetch0(c + dir).r & 127;
      if (nb != biome && nb != 0 && biome != 0) {
        float hp = hash(floor(wp * 8.0));
        if (hp > 0.5 + edgeDist * 3.0) tb = nb;
      }
    }
    col = tile(float(tb * 4 + int(v * 4.0)), f).rgb;
  } else {
    col = lut(7, biome).rgb * (0.94 + 0.12 * v);
  }
  col = mix(col, col * vec3(1.05, 0.95, 0.8), uSeasonTint * 0.5);

  float hl = float(fetch0(c + ivec2(-1, 0)).g);
  float hu = float(fetch0(c + ivec2(0, -1)).g);
  float shade = clamp(1.0 + ((h - hl) + (h - hu)) * 0.035, 0.6, 1.35);
  if (uQuality > 1) {
    float hs = float(fetch0(c + ivec2(-2, -2)).g);
    if (hs > h + 6.0) shade *= 0.82;
  }
  col *= shade;
  col *= 0.85 + h / 255.0 * 0.3;

  if (road) col = mix(col, vec3(0.55, 0.45, 0.32), 0.75);

  if (mat == 1 && depth > 0.0) {
    float d = clamp(depth / 40.0, 0.0, 1.0);
    vec3 wc = mix(vec3(0.27, 0.55, 0.78), vec3(0.08, 0.2, 0.42), d);
    float rip = noise(wp * 0.6 + vec2(uTime * 0.25, uTime * 0.17));
    wc += (rip - 0.5) * 0.06;
    if (uQuality > 1) wc += smoothstep(0.82, 0.95, noise(wp * 1.7 - uTime * 0.4)) * 0.12;
    col = mix(col, wc, clamp(0.55 + depth * 0.15, 0.0, 1.0));
  } else if (mat == 2 && depth > 0.0) {
    float n = noise(wp * 0.8 + uTime * 0.3);
    col = mix(vec3(0.75, 0.15, 0.02), vec3(1.0, 0.75, 0.15), n);
  } else if (mat == 3 && depth > 0.0) {
    float n = noise(wp * 0.9 - uTime * 0.2);
    col = mix(col, mix(vec3(0.45, 0.85, 0.1), vec3(0.75, 1.0, 0.25), n), clamp(0.6 + depth * 0.1, 0.0, 1.0));
  } else if (mat == 4 && depth > 0.0) {
    col = mix(col, vec3(0.93, 0.96, 1.0), clamp(0.4 + depth * 0.15, 0.0, 0.95));
  } else if (mat == 5 && depth > 0.0) {
    col = mix(col, vec3(0.7, 0.85, 0.95) + v * 0.05, 0.85);
  }

  if (obj > 0) {
    if (detailed) {
      float ti = obj < 80 ? float(128 + obj) : obj < 128 ? float(256 + (obj - 80) * 4 + min(stage, 3)) : float(448 + obj - 140);
      vec4 o = tile(ti, f);
      if (o.r > 0.98 && o.g < 0.02 && o.b > 0.98) o.rgb = owner > 0 ? lut(0, owner).rgb * 0.85 : vec3(0.55, 0.32, 0.22);
      col = mix(col, o.rgb * shade, o.a);
    } else {
      vec4 oc = lut(6, obj);
      col = mix(col, oc.rgb, oc.a);
    }
  }

  if (fire > 0) {
    float fl = noise(wp * 3.0 + vec2(0.0, -uTime * 4.0));
    vec3 fc = mix(vec3(1.0, 0.25, 0.0), vec3(1.0, 0.85, 0.2), fl);
    col = mix(col, fc, clamp(float(fire) / 10.0 + fl * 0.3, 0.0, 0.95));
  }

  if (owner > 0 && (uOverlay == 0 || uOverlay == 1)) {
    vec3 kc = lut(0, owner).rgb;
    bool edge = fetch1(c + ivec2(1,0)).b != owner || fetch1(c + ivec2(-1,0)).b != owner || fetch1(c + ivec2(0,1)).b != owner || fetch1(c + ivec2(0,-1)).b != owner;
    col = mix(col, kc, uOverlay == 1 ? 0.55 : 0.12);
    if (edge) col = mix(col, kc, uZoom > 3.0 ? (f.x < 0.25 || f.x > 0.75 || f.y < 0.25 || f.y > 0.75 ? 0.85 : 0.3) : 0.7);
  }
  if (uOverlay == 2 || uOverlay == 3) {
    int row = uOverlay == 2 ? 1 : 2;
    if (owner > 0) col = mix(col, lut(row, owner).rgb, 0.6); else col *= 0.6;
  }
  if (uOverlay == 4) col = mix(col * 0.3, heatColor((temp + 30.0) / 230.0), 0.85);
  if (uOverlay == 5) col = mix(col * 0.4, lut(7, biome).rgb, 0.85);

  float light = uDay;
  if (uOverlay != 4 && light < 0.999) {
    vec3 night = col * vec3(0.32, 0.38, 0.6);
    float glow = 0.0;
    if (mat == 2) glow = 1.0;
    if (fire > 0) glow = max(glow, float(fire) / 8.0);
    col = mix(night, col, max(light, glow));
  }

  if (uCloud > 0.0 && uQuality > 0) {
    float cl = noise(wp * 0.035 + vec2(uTime * 0.02, uTime * 0.01)) * noise(wp * 0.07 + 7.0);
    col *= 1.0 - smoothstep(0.25, 0.5, cl) * 0.25 * uCloud;
  }

  if (uBrush.z > 0.0) {
    vec2 d = wp - uBrush.xy;
    float r = uBrush.z;
    float dist = uBrush.w > 0.5 ? max(abs(d.x), abs(d.y)) : length(d);
    float edgeW = max(1.5 / uZoom, 0.15);
    if (abs(dist - r) < edgeW) col = mix(col, vec3(1.0), 0.7);
  }

  outColor = vec4(col, 1.0);
}`;

const ENT_VS = `#version 300 es
precision highp float;
precision highp int;
in vec2 aCorner;
in vec4 aPos;
in uvec2 aMeta;
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uView;
uniform float uAlpha;
uniform float uTime;
uniform int uDots;
out vec2 vUv;
flat out uint vSprite;
flat out uint vColor;
flat out uint vFlags;
void main(){
  vec2 p = mix(aPos.zw, aPos.xy, uAlpha);
  uint sprite = aMeta.x & 1023u;
  uint frame = (aMeta.x >> 10) & 7u;
  uint flip = (aMeta.x >> 13) & 1u;
  uint size = (aMeta.x >> 14) & 3u;
  uint flags = (aMeta.x >> 16) & 255u;
  float scale = float(size + 1u);
  if (((aMeta.x >> 24) & 1u) == 1u) scale *= 0.7;
  if (uDots == 1) scale = max(scale, 2.5 / uZoom * 1.0);
  vec2 local = aCorner * scale;
  vec2 wp = p + vec2(local.x - scale * 0.5, local.y - scale);
  vec2 sp = (wp - uCam) * uZoom + uView * 0.5;
  gl_Position = vec4(sp.x / uView.x * 2.0 - 1.0, 1.0 - sp.y / uView.y * 2.0, 0.0, 1.0);
  vUv = vec2(flip == 1u ? 1.0 - aCorner.x : aCorner.x, aCorner.y);
  vSprite = sprite * 8u + frame;
  vColor = aMeta.y & 255u;
  vFlags = flags;
}`;

const ENT_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAtlas;
uniform sampler2D uLut;
uniform int uDots;
uniform float uDay;
in vec2 vUv;
flat in uint vSprite;
flat in uint vColor;
flat in uint vFlags;
out vec4 outColor;
const float TILE = ${TILE.toFixed(1)};
const float ATLAS = ${ATLAS_SIZE.toFixed(1)};
void main(){
  vec4 kc = texelFetch(uLut, ivec2(int(vColor), 3), 0);
  if (uDots == 1) {
    vec2 d = vUv - 0.5;
    if (dot(d, d) > 0.2) discard;
    outColor = vec4(kc.rgb, 1.0);
    return;
  }
  float t = float(512u + vSprite);
  float cols = ATLAS / TILE;
  vec2 px = vec2(mod(t, cols), floor(t / cols)) * TILE + clamp(vUv, 0.0, 0.999) * TILE;
  vec4 c = texelFetch(uAtlas, ivec2(px), 0);
  if (c.a < 0.5) discard;
  if (c.r > 0.98 && c.g < 0.02 && c.b > 0.98) c.rgb = kc.rgb;
  if ((vFlags & 1u) != 0u) c.rgb = mix(c.rgb, vec3(1.0, 0.9, 0.2), 0.35);
  if ((vFlags & 2u) != 0u) c.rgb = mix(c.rgb, vec3(1.0, 0.2, 0.2), 0.5);
  c.rgb *= mix(0.45, 1.0, uDay);
  outColor = vec4(c.rgb, 1.0);
}`;

export interface RenderParams {
  time: number;
  day: number;
  overlay: number;
  quality: number;
  clouds: number;
  alpha: number;
  brush: [number, number, number, number];
  seasonTint: number;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private worldProg: WebGLProgram;
  private worldU: Record<string, WebGLUniformLocation>;
  private entProg: WebGLProgram;
  private entU: Record<string, WebGLUniformLocation>;
  private quad: WebGLVertexArrayObject;
  private entVao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private metaBuf: WebGLBuffer;
  private t0: WebGLTexture | null = null;
  private t1: WebGLTexture | null = null;
  private lut: WebGLTexture;
  private atlas: WebGLTexture;
  private worldW = 1;
  private worldH = 1;
  private entCount = 0;

  constructor(readonly canvas: HTMLCanvasElement, atlasPixels: Uint8Array) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.worldProg = compile(gl, WORLD_VS, WORLD_FS);
    this.worldU = uniforms(gl, this.worldProg);
    this.entProg = compile(gl, ENT_VS, ENT_FS);
    this.entU = uniforms(gl, this.entProg);

    this.quad = gl.createVertexArray()!;
    gl.bindVertexArray(this.quad);
    const qb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.worldProg, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.entVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.entVao);
    const cb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const lc = gl.getAttribLocation(this.entProg, 'aCorner');
    gl.enableVertexAttribArray(lc);
    gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
    this.posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    const lp = gl.getAttribLocation(this.entProg, 'aPos');
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 4, gl.FLOAT, false, ENT_STRIDE * 4, 0);
    gl.vertexAttribDivisor(lp, 1);
    this.metaBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.metaBuf);
    const lm = gl.getAttribLocation(this.entProg, 'aMeta');
    gl.enableVertexAttribArray(lm);
    gl.vertexAttribIPointer(lm, 2, gl.UNSIGNED_INT, META_STRIDE * 4, 0);
    gl.vertexAttribDivisor(lm, 1);
    gl.bindVertexArray(null);

    this.lut = texture(gl, 256, 8, new Uint8Array(256 * 8 * 4));
    this.atlas = texture(gl, ATLAS_SIZE, ATLAS_SIZE, atlasPixels);
  }

  setWorld(w: number, h: number, t0: Uint8Array, t1: Uint8Array): void {
    const gl = this.gl;
    if (this.t0) gl.deleteTexture(this.t0);
    if (this.t1) gl.deleteTexture(this.t1);
    this.worldW = w;
    this.worldH = h;
    this.t0 = texture(gl, w, h, t0);
    this.t1 = texture(gl, w, h, t1);
  }

  setLut(data: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 8, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  setAtlas(data: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ATLAS_SIZE, ATLAS_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  applyPatches(patches: ChunkPatch[], cw: number): void {
    if (!this.t0 || !this.t1) return;
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (const p of patches) {
      const cx = p.c % cw;
      const cy = (p.c - cx) / cw;
      const x = cx * CHUNK;
      const y = cy * CHUNK;
      const w = Math.min(CHUNK, this.worldW - x);
      const h = Math.min(CHUNK, this.worldH - y);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, CHUNK);
      gl.bindTexture(gl.TEXTURE_2D, this.t0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, p.t0);
      gl.bindTexture(gl.TEXTURE_2D, this.t1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, p.t1);
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
  }

  setEntities(pos: Float32Array, meta: Uint32Array, count: number): void {
    const gl = this.gl;
    this.entCount = count;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos.subarray(0, count * ENT_STRIDE), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.metaBuf);
    gl.bufferData(gl.ARRAY_BUFFER, meta.subarray(0, count * META_STRIDE), gl.DYNAMIC_DRAW);
  }

  resize(w: number, h: number): void {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw(cam: Camera, p: RenderParams): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.04, 0.05, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.t0 || !this.t1) return;
    gl.useProgram(this.worldProg);
    const u = this.worldU;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.t0);
    gl.uniform1i(u.uT0!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.t1);
    gl.uniform1i(u.uT1!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.uniform1i(u.uLut!, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(u.uAtlas!, 3);
    gl.uniform2f(u.uCam!, cam.x, cam.y);
    gl.uniform1f(u.uZoom!, cam.zoom);
    gl.uniform2f(u.uView!, cam.viewW, cam.viewH);
    gl.uniform2f(u.uWorld!, this.worldW, this.worldH);
    gl.uniform1f(u.uTime!, p.time);
    gl.uniform1f(u.uDay!, p.day);
    gl.uniform1i(u.uOverlay!, p.overlay);
    gl.uniform1i(u.uQuality!, p.quality);
    gl.uniform1f(u.uCloud!, p.clouds);
    gl.uniform4f(u.uBrush!, ...p.brush);
    gl.uniform1f(u.uSeasonTint!, p.seasonTint);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this.entCount > 0) {
      gl.useProgram(this.entProg);
      const e = this.entU;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.lut);
      gl.uniform1i(e.uLut!, 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.uniform1i(e.uAtlas!, 3);
      gl.uniform2f(e.uCam!, cam.x, cam.y);
      gl.uniform1f(e.uZoom!, cam.zoom);
      gl.uniform2f(e.uView!, cam.viewW, cam.viewH);
      gl.uniform1f(e.uAlpha!, p.alpha);
      gl.uniform1f(e.uDay!, p.day);
      gl.uniform1i(e.uDots!, cam.zoom < 3 ? 1 : 0);
      gl.bindVertexArray(this.entVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.entCount);
    }
    gl.bindVertexArray(null);
  }
}
