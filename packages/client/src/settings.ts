import { Store } from './store.ts';
import type { Lang } from '@sotv/content';

export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  lang: Lang;
  quality: Quality;
  fpsLimit: 30 | 60;
  uiScale: number;
  musicVol: number;
  sfxVol: number;
  ambientVol: number;
  soundOn: boolean;
  bloom: boolean;
  clouds: boolean;
  vibration: boolean;
  batterySaver: boolean;
  autosaveMin: number;
  ecosystem: 'off' | 'slow' | 'normal' | 'fast';
}

const KEY = 'sotv.settings';

function defaults(): Settings {
  const ru = (navigator.language || 'ru').toLowerCase().startsWith('ru') || !(navigator.language || '').toLowerCase().startsWith('en');
  return {
    lang: ru ? 'ru' : 'en',
    quality: 'auto',
    fpsLimit: 60,
    uiScale: 1,
    musicVol: 0.5,
    sfxVol: 0.7,
    ambientVol: 0.5,
    soundOn: true,
    bloom: true,
    clouds: true,
    vibration: true,
    batterySaver: false,
    autosaveMin: 3,
    ecosystem: 'normal',
  };
}

function load(): Settings {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...d, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return d;
  }
  return d;
}

export const settings = new Store<Settings>(load());
settings.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    return;
  }
});

export function patchSettings(p: Partial<Settings>): void {
  settings.update((s) => ({ ...s, ...p }));
}
