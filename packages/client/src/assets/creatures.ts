import { species } from '@sotv/content';
import type { AtlasPainter, RGB } from './atlas.ts';
import { hex, shade } from './atlas.ts';

export const CREATURE_TILE_BASE = 512;
const K: RGB = [255, 0, 255];

type Pal = Record<string, RGB>;

function frames(p: AtlasPainter, sp: number, rows: (string[] | null)[], pal: Pal): void {
  rows.forEach((r, f) => {
    if (r) p.pattern(CREATURE_TILE_BASE + sp * 8 + f, r, pal);
  });
}

const HUMANOID: string[][] = [
  ['...hh...', '..hssh..', '...ss...', '..cccc..', '.scccc..', '..cccc..', '..l..l..', '..l...l.'],
  ['...hh...', '..hssh..', '...ss...', '..cccc..', '..ccccs.', '..cccc..', '...ll...', '...ll...'],
  ['...hh..t', '..hsshst', '...ss.s.', '..cccc..', '.scccc..', '..cccc..', '..l..l..', '..l..l..'],
  ['...hh...', '..hssh..', '...ss...', '..ccccsw', '.sccc..w', '..cccc..', '..l..l..', '.l....l.'],
  ['........', '........', '........', '........', '.hh.....', 'hsscccll', '.sscccll', '........'],
  ['........', '........', '........', '........', '........', 'gggddddd', 'gg.ddd..', '........'],
  ['...hh...', '..hssh..', '...ss...', '..cccc..', '.scccc s', '..cccc..', '..l..l..', '..l..l..'],
  ['........', '........', '...hh...', '..hssh..', '...ss...', 'wwccccww', 'wwwwwwww', '........'],
];

const QUAD: string[][] = [
  ['........', '........', '......hh', '.bbbbbhe', 'tbbbbbb.', '.bbbbb..', '.l.l.l.l', '.l...l..'],
  ['........', '........', '......hh', '.bbbbbhe', 'tbbbbbb.', '.bbbbb..', '..l.l.l.', '..l...l.'],
  ['........', '........', '........', '.bbbbb..', 'tbbbbbbh', '.bbbbbhe', '.l.l.l.l', '........'],
  ['........', '.......h', '......he', '.bbbbbb.', 'tbbbbbb.', '.bbbbb..', '.l..l..l', 'l....l..'],
  ['........', '........', '........', '........', '..bbbbh.', '.bbbbbbe', '..bbbbb.', '........'],
  ['........', '........', '........', '........', '.l.l.l..', '.bbbbbbh', '..bbbbb.', '........'],
  ['........', '........', '......hh', '.bbbbbhe', 'tbbbbbb.', '.bbbbb..', '.l.l.l.l', '.l.l.l.l'],
  ['........', '........', '......hh', '.bbbbbhe', 'wwwwwwww', 'wwwwwwww', '........', '........'],
];

const CRAB: string[][] = [
  ['........', '.c....c.', 'cc....cc', '.bbbbbb.', 'bbebbebb', '.bbbbbb.', 'l.l..l.l', '........'],
  ['........', 'c......c', '.c....c.', '.bbbbbb.', 'bbebbebb', '.bbbbbb.', '.l.ll.l.', '........'],
  ['cc....cc', '.c....c.', '........', '.bbbbbb.', 'bbebbebb', '.bbbbbb.', 'l.l..l.l', '........'],
  ['c......c', 'cc....cc', '........', '.bbbbbb.', 'bbebbebb', '.bbbbbb.', 'l.l..l.l', '........'],
  ['........', '........', '........', '.bbbbbb.', 'bb-bb-bb', '.bbbbbb.', 'l.l..l.l', '........'],
  ['........', '........', '........', 'l.l..l.l', '.bbbbbb.', 'bbxbbxbb', '.bbbbbb.', '........'],
  ['........', '.c....c.', 'cc....cc', '.bbbbbb.', 'bbebbebb', '.bbbbbb.', 'l.l..l.l', '........'],
  ['........', '.c....c.', 'cc....cc', '.bbbbbb.', 'wwwwwwww', 'wwwwwwww', '........', '........'],
];

const LIZARD: string[][] = [
  ['........', '........', '........', '......hh', 'tttbbbhe', '..bbbb..', '.l..l...', 'l....l..'],
  ['........', '........', '........', '......hh', 'tttbbbhe', '..bbbb..', '..l..l..', '..l..l..'],
  ['........', '........', '........', '.......h', 'tttbbbhh', '..bbbbe.', '.l..l...', '........'],
  ['........', '........', '......hh', '......he', 'tttbbbb.', '..bbbb..', '.l..l...', 'l....l..'],
  ['........', '........', '........', '........', 'tttbbbhh', '..bbbb-.', '........', '........'],
  ['........', '........', '........', '........', '.l..l...', 'tttbbbhx', '..bbbb..', '........'],
  ['........', '........', '........', '......hh', 'tttbbbhe', '..bbbb..', '.l..l...', '.l..l...'],
  ['........', '........', '........', '......hh', 'wwwwwwww', 'wwwwwwww', '........', '........'],
];

const DRAGON: string[][] = [
  ['.ww..ww.', 'wwww.wwh', '.wbbbbhe', 'tbbbbbbh', 'tbbbbbb.', '.bbbbb..', '.l..l...', '........'],
  ['w......w', 'ww....wh', '.wbbbbhe', 'tbbbbbbh', 'tbbbbbb.', '.bbbbb..', '..l..l..', '........'],
  ['.ww..ww.', 'wwww.wwh', '.wbbbbhe', 'tbbbbbbf', 'tbbbbbbf', '.bbbbb.f', '.l..l...', '........'],
  ['.ww..ww.', 'wwww.wwh', '.wbbbbhe', 'tbbbbbbhff', 'tbbbbbb.ff', '.bbbbb..', '.l..l...', '........'],
  ['........', '........', '........', '.ww..ww.', 'tbbbbbbh', '.bbbbbhe', '........', '........'],
  ['........', '........', '........', '........', 'tbbbbbbh', '.bbbbbhx', '........', '........'],
  ['.ww..ww.', 'wwww.wwh', '.wbbbbhe', 'tbbbbbbh', 'tbbbbbb.', '.bbbbb..', '.l..l...', '........'],
  ['.ww..ww.', 'wwww.wwh', '.wbbbbhe', 'tbbbbbbh', 'tbbbbbb.', '.bbbbb..', '.l..l...', '........'],
];

function humanoidPal(c: { skin: string; hair: string; cloth: string }, cloth: RGB): Pal {
  return {
    h: hex(c.hair),
    s: hex(c.skin),
    c: cloth,
    l: [60, 45, 35],
    t: [150, 150, 160],
    w: [110, 180, 230],
    g: shade(hex(c.skin), 0.6),
    d: [90, 90, 96],
  };
}

const BOAT = ['........', '...k....', '...kk...', '...kkk..', '...k....', 'wwwwwwww', '.wwwwww.', '........'];

export function drawCreatures(p: AtlasPainter): void {
  for (let f = 0; f < 8; f++) p.pattern(CREATURE_TILE_BASE + 30 * 8 + f, f % 2 ? BOAT.map((r, y) => (y >= 5 ? r : r)) : BOAT, { k: K, w: [120, 82, 46] });
  for (const sp of species) {
    const skin = hex(sp.colors.skin);
    const hair = hex(sp.colors.hair);
    if (sp.kind === 'civ') {
      frames(p, sp.id, HUMANOID, humanoidPal(sp.colors, K));
      continue;
    }
    const pal: Pal = { b: skin, h: shade(skin, 0.9), e: [20, 16, 16], t: hair, l: shade(skin, 0.6), w: [110, 180, 230], c: shade(skin, 1.15), '-': shade(skin, 0.5), x: [30, 30, 30], f: [255, 150, 40] };
    switch (sp.key) {
      case 'crab':
      case 'titancrab':
        frames(p, sp.id, CRAB, pal);
        break;
      case 'lizard':
        frames(p, sp.id, LIZARD, pal);
        break;
      case 'dragon':
        frames(p, sp.id, DRAGON, { ...pal, w: hair });
        break;
      case 'demon':
      case 'undead':
      case 'alien':
      case 'mutant': {
        const hp = humanoidPal({ skin: sp.colors.skin, hair: sp.colors.hair, cloth: sp.colors.hair }, hair);
        if (sp.key === 'undead') hp.c = [80, 76, 70];
        if (sp.key === 'alien') {
          hp.h = skin;
          hp.c = [180, 190, 210];
        }
        frames(p, sp.id, HUMANOID, hp);
        if (sp.key === 'demon') {
          for (let f = 0; f < 8; f++) {
            if (f === 4 || f === 5) continue;
            p.set(CREATURE_TILE_BASE + sp.id * 8 + f, 2, 0, [240, 200, 60]);
            p.set(CREATURE_TILE_BASE + sp.id * 8 + f, 5, 0, [240, 200, 60]);
          }
        }
        if (sp.key === 'alien') for (let f = 0; f < 8; f++) if (f !== 4 && f !== 5) p.set(CREATURE_TILE_BASE + sp.id * 8 + f, 4, 1, [10, 10, 10]);
        break;
      }
      case 'sheep':
        frames(p, sp.id, QUAD, { ...pal, h: hair, t: skin, l: hair });
        break;
      case 'rabbit':
        frames(p, sp.id, QUAD, { ...pal, h: skin, t: [250, 250, 250] });
        for (let f = 0; f < 8; f++) if (f !== 4 && f !== 5) p.set(CREATURE_TILE_BASE + sp.id * 8 + f, 6, 1, skin);
        break;
      default:
        frames(p, sp.id, QUAD, pal);
        if (sp.key === 'deer') for (let f = 0; f < 8; f++) if (f !== 4 && f !== 5) p.set(CREATURE_TILE_BASE + sp.id * 8 + f, 6, 0, hair);
    }
  }
}
