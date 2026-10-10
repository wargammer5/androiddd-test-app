import { economy } from '@sotv/content';

export const RES = economy.resources;
export const R = Object.fromEntries(RES.map((r, i) => [r, i])) as Record<string, number>;
export const RES_COUNT = RES.length;

export type Cost = Record<string, number>;

export interface LedgerEntry {
  tick: number;
  op: 'add' | 'spend' | 'reserve' | 'release' | 'consume' | 'spoil' | 'drop';
  res: string;
  amount: number;
  reason: string;
}

export class Store {
  readonly amount = new Float64Array(RES_COUNT);
  readonly reserved = new Float64Array(RES_COUNT);
  readonly totalIn = new Float64Array(RES_COUNT);
  readonly totalOut = new Float64Array(RES_COUNT);
  capacity = 300;
  debug = false;
  ledger: LedgerEntry[] = [];
  private reservations = new Map<number, Float64Array>();
  private nextRes = 1;
  tick = 0;

  private snap(r: number): void {
    if (Math.abs(this.amount[r]!) < 1e-7) this.amount[r] = 0;
    if (Math.abs(this.reserved[r]!) < 1e-7) this.reserved[r] = 0;
  }

  private log(op: LedgerEntry['op'], r: number, amount: number, reason: string): void {
    this.snap(r);
    if (!this.debug) return;
    this.ledger.push({ tick: this.tick, op, res: RES[r]!, amount, reason });
    if (this.ledger.length > 500) this.ledger.splice(0, this.ledger.length - 500);
  }

  get(res: string): number {
    return this.amount[R[res]!] ?? 0;
  }

  free(res: string): number {
    const r = R[res]!;
    return this.amount[r]! - this.reserved[r]!;
  }

  total(): number {
    let t = 0;
    for (let r = 0; r < RES_COUNT; r++) if (RES[r] !== 'knowledge') t += this.amount[r]!;
    return t;
  }

  room(): number {
    return Math.max(0, this.capacity - this.total());
  }

  add(res: string, n: number, reason: string): number {
    const r = R[res];
    if (r === undefined || !(n > 0)) return 0;
    const accepted = res === 'knowledge' ? n : Math.min(n, this.room());
    if (accepted <= 0) return 0;
    this.amount[r] = this.amount[r]! + accepted;
    this.totalIn[r] = this.totalIn[r]! + accepted;
    this.log('add', r, accepted, reason);
    return accepted;
  }

  canSpend(cost: Cost): boolean {
    for (const k in cost) {
      const r = R[k];
      if (r === undefined) return false;
      if (this.amount[r]! - this.reserved[r]! < cost[k]! - 1e-9) return false;
    }
    return true;
  }

  spend(cost: Cost, reason: string): boolean {
    if (!this.canSpend(cost)) return false;
    for (const k in cost) {
      const r = R[k]!;
      const n = cost[k]!;
      if (n <= 0) continue;
      this.amount[r] = this.amount[r]! - n;
      this.totalOut[r] = this.totalOut[r]! + n;
      this.log('spend', r, n, reason);
    }
    return true;
  }

  takeUpTo(res: string, n: number, reason: string): number {
    const r = R[res];
    if (r === undefined) return 0;
    const got = Math.max(0, Math.min(n, this.amount[r]! - this.reserved[r]!));
    if (got <= 0) return 0;
    this.amount[r] = this.amount[r]! - got;
    this.totalOut[r] = this.totalOut[r]! + got;
    this.log('spend', r, got, reason);
    return got;
  }

  reserve(cost: Cost, reason: string): number {
    if (!this.canSpend(cost)) return 0;
    const v = new Float64Array(RES_COUNT);
    for (const k in cost) {
      const r = R[k]!;
      v[r] = cost[k]!;
      this.reserved[r] = this.reserved[r]! + cost[k]!;
      this.log('reserve', r, cost[k]!, reason);
    }
    const id = this.nextRes++;
    this.reservations.set(id, v);
    return id;
  }

  consumeReserved(id: number, fraction: number, reason: string): boolean {
    const v = this.reservations.get(id);
    if (!v) return false;
    for (let r = 0; r < RES_COUNT; r++) {
      const left = v[r]!;
      if (left <= 0) continue;
      const n = Math.min(left, left * fraction + 1e-9);
      v[r] = left - n;
      this.reserved[r] = Math.max(0, this.reserved[r]! - n);
      this.amount[r] = Math.max(0, this.amount[r]! - n);
      this.totalOut[r] = this.totalOut[r]! + n;
      this.log('consume', r, n, reason);
    }
    return true;
  }

  release(id: number, reason: string): void {
    const v = this.reservations.get(id);
    if (!v) return;
    for (let r = 0; r < RES_COUNT; r++) {
      if (v[r]! <= 0) continue;
      this.reserved[r] = Math.max(0, this.reserved[r]! - v[r]!);
      this.log('release', r, v[r]!, reason);
    }
    this.reservations.delete(id);
  }

  finish(id: number, reason: string): void {
    const v = this.reservations.get(id);
    if (!v) return;
    this.consumeReserved(id, 1, reason);
    this.reservations.delete(id);
  }

  remaining(id: number): Cost | null {
    const v = this.reservations.get(id);
    if (!v) return null;
    const out: Cost = {};
    for (let r = 0; r < RES_COUNT; r++) if (v[r]! > 1e-6) out[RES[r]!] = v[r]!;
    return out;
  }

  spoil(res: string, fraction: number, reason: string): number {
    const r = R[res]!;
    const free = this.amount[r]! - this.reserved[r]!;
    if (free <= 0) return 0;
    const n = Math.max(free > 2 ? 1 : 0, Math.floor(free * fraction));
    if (n <= 0) return 0;
    this.amount[r] = this.amount[r]! - n;
    this.totalOut[r] = this.totalOut[r]! + n;
    this.log('spoil', r, n, reason);
    return n;
  }

  check(): string[] {
    const errs: string[] = [];
    let resSum = new Float64Array(RES_COUNT);
    for (const v of this.reservations.values()) for (let r = 0; r < RES_COUNT; r++) resSum[r] = resSum[r]! + v[r]!;
    for (let r = 0; r < RES_COUNT; r++) {
      const a = this.amount[r]!;
      if (a < -1e-6) errs.push(`${RES[r]} negative ${a}`);
      if (this.reserved[r]! > a + 1e-6) errs.push(`${RES[r]} reserved ${this.reserved[r]} > amount ${a}`);
      if (Math.abs(this.reserved[r]! - resSum[r]!) > 1e-4) errs.push(`${RES[r]} reserved mismatch ${this.reserved[r]} vs ${resSum[r]}`);
      if (Math.abs(this.totalIn[r]! - this.totalOut[r]! - a) > 1e-4) errs.push(`${RES[r]} ledger mismatch in ${this.totalIn[r]} out ${this.totalOut[r]} have ${a}`);
    }
    resSum = new Float64Array(0);
    return errs;
  }

  toJSON(): unknown {
    return {
      amount: Array.from(this.amount),
      reserved: Array.from(this.reserved),
      totalIn: Array.from(this.totalIn),
      totalOut: Array.from(this.totalOut),
      capacity: this.capacity,
      res: [...this.reservations].map(([k, v]) => [k, Array.from(v)]),
      next: this.nextRes,
    };
  }

  static fromJSON(o: { amount: number[]; reserved: number[]; totalIn: number[]; totalOut: number[]; capacity: number; res: [number, number[]][]; next: number }): Store {
    const s = new Store();
    s.amount.set(o.amount.slice(0, RES_COUNT));
    s.reserved.set(o.reserved.slice(0, RES_COUNT));
    s.totalIn.set(o.totalIn.slice(0, RES_COUNT));
    s.totalOut.set(o.totalOut.slice(0, RES_COUNT));
    s.capacity = o.capacity;
    for (const [k, v] of o.res) s.reservations.set(k, Float64Array.from(v));
    s.nextRes = o.next;
    return s;
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (let r = 0; r < RES_COUNT; r++) out[RES[r]!] = Math.floor(this.amount[r]!);
    return out;
  }
}
