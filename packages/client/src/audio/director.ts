import type { GameSession } from '../game.ts';
import type { SimEvent } from '@sotv/sim';
import { audio } from './engine.ts';
import type { SfxName } from './synth.ts';
import { isNightPhase } from './time.ts';

const EVENT_SFX: Record<string, SfxName> = {
  war: 'horn',
  capture: 'horn',
  peace: 'bell',
  alliance: 'bell',
  city: 'bell',
  colonyFounded: 'bell',
  religion: 'chime',
  schism: 'chime',
  conversion: 'chime',
  ruler: 'bell',
  coup: 'clash',
  kingdomFell: 'growl',
  earthquake: 'quake',
  volcano: 'explosion',
  comet: 'whoosh',
  invasion: 'growl',
  plague: 'growl',
  wildfire: 'fire',
  era: 'chime',
  tech: 'coin',
  gift: 'coin',
  hero: 'chime',
  death: 'death',
  crab: 'growl',
};

const POWER_SFX: Record<string, SfxName> = {
  lava: 'fire',
  fire: 'fire',
  water: 'splash',
  ocean: 'splash',
  rain: 'splash',
  acid: 'splash',
  lightning: 'thunder',
  storm: 'thunder',
  bomb: 'explosion',
  nuke: 'explosion',
  comet: 'whoosh',
  earthquake: 'quake',
  volcano: 'explosion',
  smite: 'clash',
  bless: 'chime',
  heal: 'chime',
  gift: 'coin',
  prophet: 'chime',
  city_flag: 'build',
  magnet: 'whoosh',
};

export class SoundDirector {
  private lastEventMood = 0;
  private disasterUntil = 0;
  private warUntil = 0;
  private biome = 1;
  private nearWater = 0;
  private timer: ReturnType<typeof setInterval>;
  private unsub: (() => void)[] = [];

  constructor(private session: GameSession) {
    const s = session;
    this.unsub.push(
      s.events.subscribe((list) => {
        const fresh = list.slice(this.lastEventMood ? -8 : -1);
        this.lastEventMood = list.length;
        for (const e of fresh) this.onEvent(e);
      }),
    );
    this.timer = setInterval(() => void this.update(), 1500);
  }

  dispose(): void {
    clearInterval(this.timer);
    this.unsub.forEach((u) => u());
    audio.ambient({});
    audio.setMood('menu');
  }

  private seen = new Set<string>();

  private onEvent(e: SimEvent): void {
    const key = `${e.tick}:${e.kind}:${e.text}:${e.x ?? ''}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 500) this.seen.clear();
    const now = performance.now();
    if (['war', 'capture', 'invasion', 'rebellion'].includes(e.kind)) this.warUntil = now + 60000;
    if (['earthquake', 'volcano', 'comet', 'plague', 'famine', 'drought', 'wildfire'].includes(e.kind)) this.disasterUntil = now + 40000;
    const name = EVENT_SFX[e.kind];
    if (!name) return;
    this.spatial(name, e.x, e.y, e.important ? 1 : 0.6);
  }

  spatial(name: SfxName, x?: number, y?: number, vol = 1): void {
    const cam = this.session.cam;
    if (x === undefined || y === undefined) {
      audio.play(name, { volume: vol * 0.7 });
      return;
    }
    const v = cam.visible();
    const cx = (v.x0 + v.x1) / 2;
    const half = Math.max(8, (v.x1 - v.x0) / 2);
    const dx = x - cx;
    const dy = y - (v.y0 + v.y1) / 2;
    const dist = Math.hypot(dx, dy) / half;
    const att = Math.max(0.12, 1 / (1 + dist * dist));
    audio.play(name, { volume: vol * att, pan: dx / half });
  }

  onPower(power: string, x: number, y: number): void {
    const n = POWER_SFX[power] ?? 'place';
    this.spatial(n, x, y, 0.8);
  }

  private async update(): Promise<void> {
    const s = this.session;
    const st = s.stats.get();
    if (!st || !s.ready.get()) return;
    const v = s.cam.visible();
    const cx = Math.floor((v.x0 + v.x1) / 2);
    const cy = Math.floor((v.y0 + v.y1) / 2);
    const cell = await s.query<{ biome: number; mat: number; depth: number } | null>({ kind: 'cell', x: Math.max(0, cx), y: Math.max(0, cy) });
    if (cell) {
      this.biome = cell.biome;
      this.nearWater = cell.mat === 1 && cell.depth > 0 ? 1 : this.nearWater * 0.6;
    }
    const night = isNightPhase(st.dayPhase);
    const zoomFar = s.cam.zoom < 2.5 ? 0.4 : 1;
    const forest = [1, 2, 3, 4, 8, 11].includes(this.biome);
    const cold = [6, 7].includes(this.biome);
    const sea = this.biome === 0 || this.biome === 12;
    audio.ambient({
      rain: st.weather === 1 || st.weather === 3 ? 0.7 : 0,
      wind: (cold ? 0.6 : 0.15) * zoomFar + (st.weather === 3 ? 0.4 : 0),
      birds: forest && !night && st.weather === 0 ? 0.45 * zoomFar : 0,
      night: night && !cold ? 0.35 * zoomFar : 0,
      sea: sea || this.nearWater > 0.3 ? 0.55 : 0,
      crackle: st.worldAge === 'fire' ? 0.3 : 0,
    });
    const now = performance.now();
    audio.setMood(st.tick === 0 ? 'calm' : now < this.disasterUntil ? 'disaster' : now < this.warUntil ? 'war' : night ? 'night' : 'calm');
  }
}
