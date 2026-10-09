import type { SaveReader, SaveWriter } from './save.ts';

export const ENT_CAP = 6000;
export const ID_BITS = 13;
export const ID_MASK = (1 << ID_BITS) - 1;
export const MAX_TRAITS = 5;

export const enum Task {
  Wander = 0,
  Eat = 1,
  Sleep = 2,
  Rest = 3,
  Flee = 4,
  Fight = 5,
  Social = 6,
  Mate = 7,
  Gather = 8,
  Work = 9,
  GoHome = 10,
  Hunt = 11,
  Explore = 12,
  Build = 13,
  Haul = 14,
  Pray = 15,
  Study = 16,
  Trade = 17,
  Sail = 18,
  Siege = 19,
  Migrate = 20,
  Controlled = 21,
}
export const TASK_COUNT = 22;

export const enum Anim {
  Walk = 0,
  Work = 2,
  Attack = 3,
  Sleep = 4,
  Dead = 5,
  Idle = 6,
  Swim = 7,
}

export const enum EFlag {
  Favorite = 1,
  Leader = 2,
  Ruler = 4,
  Controlled = 8,
  Boat = 16,
  Undead = 32,
  Possessed = 64,
  Hero = 128,
}

function f32(n: number) {
  return new Float32Array(n);
}

export class Entities {
  readonly cap = ENT_CAP;
  count = 0;
  alive = new Uint8Array(ENT_CAP);
  gen = new Uint16Array(ENT_CAP);
  species = new Uint8Array(ENT_CAP);
  x = f32(ENT_CAP);
  y = f32(ENT_CAP);
  px = f32(ENT_CAP);
  py = f32(ENT_CAP);
  tx = new Int32Array(ENT_CAP);
  ty = new Int32Array(ENT_CAP);
  hp = f32(ENT_CAP);
  maxHp = f32(ENT_CAP);
  dmg = f32(ENT_CAP);
  armor = f32(ENT_CAP);
  speed = f32(ENT_CAP);
  vision = f32(ENT_CAP);
  crit = f32(ENT_CAP);
  age = f32(ENT_CAP);
  lifespan = f32(ENT_CAP);
  xp = f32(ENT_CAP);
  level = new Uint8Array(ENT_CAP);
  hunger = f32(ENT_CAP);
  energy = f32(ENT_CAP);
  fatigue = f32(ENT_CAP);
  social = f32(ENT_CAP);
  mood = f32(ENT_CAP);
  fertility = f32(ENT_CAP);
  hungerRate = f32(ENT_CAP);
  fatigueRate = f32(ENT_CAP);
  xpRate = f32(ENT_CAP);
  task = new Uint8Array(ENT_CAP);
  taskTimer = new Int32Array(ENT_CAP);
  taskTarget = new Int32Array(ENT_CAP);
  stuck = new Uint16Array(ENT_CAP);
  repaths = new Uint8Array(ENT_CAP);
  bestDist = f32(ENT_CAP);
  cooldown = new Uint16Array(ENT_CAP);
  traits = new Uint8Array(ENT_CAP * MAX_TRAITS);
  mother = new Int32Array(ENT_CAP);
  father = new Int32Array(ENT_CAP);
  children = new Uint16Array(ENT_CAP);
  sex = new Uint8Array(ENT_CAP);
  city = new Int16Array(ENT_CAP);
  kingdom = new Int16Array(ENT_CAP);
  culture = new Int16Array(ENT_CAP);
  religion = new Int16Array(ENT_CAP);
  clan = new Int16Array(ENT_CAP);
  job = new Uint8Array(ENT_CAP);
  carry = new Uint8Array(ENT_CAP);
  carryAmt = new Uint16Array(ENT_CAP);
  tool = new Uint8Array(ENT_CAP);
  toolWear = new Uint8Array(ENT_CAP);
  kills = new Uint16Array(ENT_CAP);
  dir = new Uint8Array(ENT_CAP);
  anim = new Uint8Array(ENT_CAP);
  flags = new Uint8Array(ENT_CAP);
  nameSeed = new Uint32Array(ENT_CAP);
  born = new Int32Array(ENT_CAP);
  attacker = new Int32Array(ENT_CAP);
  home = new Int32Array(ENT_CAP);
  phase = new Uint8Array(ENT_CAP);
  workTimer = new Uint16Array(ENT_CAP);
  private free: number[] = [];
  private top = 0;
  names = new Map<number, string>();
  history = new Map<number, string[]>();

  constructor() {
    this.city.fill(-1);
    this.kingdom.fill(-1);
    this.culture.fill(-1);
    this.religion.fill(-1);
    this.clan.fill(-1);
    this.mother.fill(-1);
    this.father.fill(-1);
    this.home.fill(-1);
    this.attacker.fill(-1);
  }

  id(i: number): number {
    return i | (this.gen[i]! << ID_BITS);
  }

  index(id: number): number {
    if (id < 0) return -1;
    const i = id & ID_MASK;
    if (i >= ENT_CAP || !this.alive[i] || this.gen[i] !== id >>> ID_BITS) return -1;
    return i;
  }

  spawn(): number {
    let i: number;
    if (this.free.length) i = this.free.pop()!;
    else if (this.top < ENT_CAP) i = this.top++;
    else return -1;
    this.alive[i] = 1;
    this.gen[i] = (this.gen[i]! % 65535) + 1;
    this.count++;
    this.city[i] = -1;
    this.kingdom[i] = -1;
    this.culture[i] = -1;
    this.religion[i] = -1;
    this.clan[i] = -1;
    this.mother[i] = -1;
    this.father[i] = -1;
    this.home[i] = -1;
    this.attacker[i] = -1;
    this.children[i] = 0;
    this.kills[i] = 0;
    this.xp[i] = 0;
    this.level[i] = 1;
    this.carry[i] = 0;
    this.carryAmt[i] = 0;
    this.tool[i] = 0;
    this.toolWear[i] = 0;
    this.flags[i] = 0;
    this.task[i] = 0;
    this.taskTimer[i] = 0;
    this.taskTarget[i] = -1;
    this.stuck[i] = 0;
    this.repaths[i] = 0;
    this.cooldown[i] = 0;
    this.job[i] = 0;
    this.phase[i] = 0;
    this.workTimer[i] = 0;
    this.anim[i] = 0;
    this.traits.fill(255, i * MAX_TRAITS, i * MAX_TRAITS + MAX_TRAITS);
    return i;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.count--;
    this.free.push(i);
    this.names.delete(i);
    this.history.delete(i);
  }

  get high(): number {
    return this.top;
  }

  hasTrait(i: number, t: number): boolean {
    const o = i * MAX_TRAITS;
    for (let k = 0; k < MAX_TRAITS; k++) if (this.traits[o + k] === t) return true;
    return false;
  }

  traitList(i: number): number[] {
    const out: number[] = [];
    const o = i * MAX_TRAITS;
    for (let k = 0; k < MAX_TRAITS; k++) {
      const t = this.traits[o + k]!;
      if (t !== 255) out.push(t);
    }
    return out;
  }

  addHistory(i: number, text: string): void {
    let h = this.history.get(i);
    if (!h) {
      h = [];
      this.history.set(i, h);
    }
    h.push(text);
    if (h.length > 12) h.shift();
  }

  private arrays(): [string, ArrayBufferView][] {
    const out: [string, ArrayBufferView][] = [];
    for (const [k, v] of Object.entries(this)) if (ArrayBuffer.isView(v)) out.push([k, v]);
    return out;
  }

  save(w: SaveWriter): void {
    for (const [k, v] of this.arrays()) w.array('E.' + k, v);
    w.json('E.meta', { count: this.count, top: this.top, free: this.free, names: [...this.names], history: [...this.history] });
  }

  load(r: SaveReader): void {
    for (const [k, v] of this.arrays()) r.into('E.' + k, v);
    const m = r.jsonOr<{ count: number; top: number; free: number[]; names: [number, string][]; history: [number, string[]][] } | null>('E.meta', null);
    if (m) {
      this.count = m.count;
      this.top = m.top;
      this.free = m.free;
      this.names = new Map(m.names);
      this.history = new Map(m.history);
    }
  }
}

export class SpatialHash {
  readonly cell = 8;
  readonly cols: number;
  readonly rows: number;
  head: Int32Array;
  next = new Int32Array(ENT_CAP);

  constructor(w: number, h: number) {
    this.cols = Math.ceil(w / this.cell);
    this.rows = Math.ceil(h / this.cell);
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
  }

  rebuild(e: Entities): void {
    this.head.fill(-1);
    const c = this.cell;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(e.x[i]! / c)));
      const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(e.y[i]! / c)));
      const b = cy * this.cols + cx;
      this.next[i] = this.head[b]!;
      this.head[b] = i;
    }
  }

  query(x: number, y: number, r: number, fn: (i: number) => boolean | void): void {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r) / c));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r) / c));
    const y0 = Math.max(0, Math.floor((y - r) / c));
    const y1 = Math.min(this.rows - 1, Math.floor((y + r) / c));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.head[cy * this.cols + cx]!;
        while (i >= 0) {
          if (fn(i) === true) return;
          i = this.next[i]!;
        }
      }
  }
}
