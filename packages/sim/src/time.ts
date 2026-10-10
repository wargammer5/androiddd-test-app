export const TICKS_PER_DAY = 180;
export const DAYS_PER_SEASON = 2;
export const SEASONS = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS;
export const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;
export const TICKS_PER_SECOND = 12;

export const enum Season {
  Spring = 0,
  Summer = 1,
  Autumn = 2,
  Winter = 3,
}

export function calendar(tick: number): { year: number; day: number; season: number; dayPhase: number; dayOfYear: number } {
  const year = Math.floor(tick / TICKS_PER_YEAR);
  const t = tick - year * TICKS_PER_YEAR;
  const dayOfYear = Math.floor(t / TICKS_PER_DAY);
  const dayPhase = (t - dayOfYear * TICKS_PER_DAY) / TICKS_PER_DAY;
  return { year, day: dayOfYear, season: Math.floor(dayOfYear / DAYS_PER_SEASON), dayPhase, dayOfYear };
}

export function isNight(tick: number): boolean {
  const p = (tick % TICKS_PER_DAY) / TICKS_PER_DAY;
  return p < 0.2 || p > 0.8;
}
