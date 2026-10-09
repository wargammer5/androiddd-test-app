import type { World } from './world.ts';

interface Rec {
  stroke: number;
  power: string;
  cells: Map<number, number[]>;
  spawned: number[];
}

export class UndoStack {
  private stack: Rec[] = [];
  private cur: Rec | null = null;
  readonly limit = 12;

  begin(stroke: number, power: string): void {
    if (this.cur && this.cur.stroke === stroke && this.cur.power === power) return;
    this.cur = { stroke, power, cells: new Map(), spawned: [] };
    this.stack.push(this.cur);
    if (this.stack.length > this.limit) this.stack.shift();
  }

  record(w: World, i: number): void {
    const c = this.cur;
    if (!c || c.cells.has(i)) return;
    if (c.cells.size > 200000) return;
    c.cells.set(i, [w.biome[i]!, w.height[i]!, w.mat[i]!, w.depth[i]!, w.obj[i]!, w.objData[i]!, w.fire[i]!, w.road[i]!, w.heat[i]!]);
  }

  spawned(id: number): void {
    this.cur?.spawned.push(id);
  }

  pop(w: World): { cells: number; spawned: number[] } | null {
    const r = this.stack.pop();
    this.cur = null;
    if (!r) return null;
    for (const [i, v] of r.cells) {
      w.biome[i] = v[0]!;
      w.height[i] = v[1]!;
      w.mat[i] = v[2]!;
      w.depth[i] = v[3]!;
      w.obj[i] = v[4]!;
      w.objData[i] = v[5]!;
      w.fire[i] = v[6]!;
      w.road[i] = v[7]!;
      w.heat[i] = v[8]!;
      w.wake(i, 30);
    }
    return { cells: r.cells.size, spawned: r.spawned };
  }

  get size(): number {
    return this.stack.length;
  }
}
