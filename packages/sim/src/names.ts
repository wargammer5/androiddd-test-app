import { Rng } from './rng.ts';

const SYL: string[][] = [
  ['an', 'ver', 'mi', 'lo', 'ra', 'ten', 'sa', 'dor', 'el', 'ka', 'ri', 'mon', 'ta', 'ly', 'ven', 'ar'],
  ['dur', 'grom', 'bak', 'tor', 'kul', 'mar', 'bro', 'dun', 'hal', 'gor', 'rik', 'sto', 'bar', 'nok', 'ul', 'zar'],
  ['ae', 'lis', 'thi', 'el', 'ny', 'sil', 'va', 'lia', 'rin', 'wen', 'ia', 'lo', 'mae', 'fa', 'ri', 'on'],
  ['ssa', 'kar', 'zix', 'tha', 'ruk', 'ses', 'vo', 'ksa', 'iss', 'raz', 'shi', 'kha', 'tet', 'zu', 'ash', 'ok'],
];

export function personName(seed: number, race: number): string {
  const r = new Rng(seed);
  const s = SYL[Math.max(0, race) % SYL.length]!;
  const n = 2 + (r.int(3) === 0 ? 1 : 0);
  let out = '';
  for (let k = 0; k < n; k++) out += r.pick(s);
  if (race === 3 && r.chance(0.3)) out += '-' + r.pick(s);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const SUFFIX: string[][] = [
  ['ford', 'ton', 'vale', 'mir', 'grad', 'holm', 'stead'],
  ['heim', 'dun', 'gard', 'hold', 'berg', 'kar', 'rok'],
  ['wyn', 'londe', 'thil', 'aen', 'riel', 'dell', 'sae'],
  ['ssk', 'zar', 'khet', 'thor', 'ksis', 'mog', 'ruk'],
];

export function placeName(seed: number, race: number): string {
  const r = new Rng(seed ^ 0x51ed);
  const s = SYL[Math.max(0, race) % SYL.length]!;
  let out = r.pick(s) + (r.chance(0.6) ? r.pick(s) : '');
  out += r.pick(SUFFIX[Math.max(0, race) % SUFFIX.length]!);
  return out.charAt(0).toUpperCase() + out.slice(1);
}
