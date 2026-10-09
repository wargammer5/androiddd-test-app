export interface Laws {
  godPowers: boolean;
  disasters: boolean;
  aging: boolean;
  reproduction: boolean;
  hunger: boolean;
  wars: boolean;
  rebellions: boolean;
  cityGrowth: boolean;
  ai: boolean;
  religions: boolean;
  worldAges: boolean;
  ecosystem: 'off' | 'slow' | 'normal' | 'fast';
  eventFrequency: number;
}

export const DEFAULT_LAWS: Laws = {
  godPowers: true,
  disasters: true,
  aging: true,
  reproduction: true,
  hunger: true,
  wars: true,
  rebellions: true,
  cityGrowth: true,
  ai: true,
  religions: true,
  worldAges: true,
  ecosystem: 'normal',
  eventFrequency: 1,
};

export const LAW_PROFILES: Record<string, Partial<Laws>> = {
  garden: { disasters: false, wars: false, rebellions: false, eventFrequency: 0.3, ecosystem: 'fast', worldAges: false },
  classic: { ...DEFAULT_LAWS },
  chaos: { disasters: true, wars: true, rebellions: true, eventFrequency: 2, ecosystem: 'normal' },
  apocalypse: { disasters: true, wars: true, rebellions: true, eventFrequency: 3.5, ecosystem: 'slow', reproduction: true },
};

export function sanitizeLaws(l: Partial<Laws>): Laws {
  const out = { ...DEFAULT_LAWS };
  for (const k of Object.keys(DEFAULT_LAWS) as (keyof Laws)[]) {
    const v = l[k];
    if (v === undefined) continue;
    if (typeof v === typeof DEFAULT_LAWS[k]) (out as Record<string, unknown>)[k] = v;
  }
  out.godPowers = true;
  return out;
}
