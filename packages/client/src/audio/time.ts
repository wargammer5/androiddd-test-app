export function isNightPhase(p: number): boolean {
  return p < 0.15 || p > 0.85;
}
