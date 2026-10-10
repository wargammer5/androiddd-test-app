import type { SimEvent } from '@sotv/sim';
import { t } from '../i18n.ts';

const KEY_PREFIX = /^(species|era|age|cause|result|plot|tech|bld|res|season|biome|tenet|ctrait)\./;

export function eventText(e: SimEvent): string {
  const args: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(e.args ?? {})) args[k] = typeof v === 'string' && KEY_PREFIX.test(v) ? t(v) : v;
  return t(e.text, args);
}

export const EVENT_ICON: Record<string, string> = {
  war: '⚔',
  peace: '🕊',
  alliance: '🤝',
  betrayal: '🗡',
  capture: '🏴',
  city: '🏰',
  cityRuined: '🏚',
  colony: '⛵',
  colonyFounded: '⛵',
  kingdomFell: '💀',
  ruler: '👑',
  coup: '🗡',
  plot: '🕯',
  plotFailed: '⚖',
  rebellion: '✊',
  religion: '⛩',
  schism: '⚡',
  conversion: '⛩',
  era: '📜',
  tech: '💡',
  death: '✝',
  hero: '⭐',
  age: '🌗',
  drought: '🏜',
  flood: '🌊',
  plague: '🦠',
  famine: '🥀',
  earthquake: '🌐',
  volcano: '🌋',
  comet: '☄',
  invasion: '👾',
  wildfire: '🔥',
  uprising: '✊',
  respawn: '🐾',
  trade: '🐫',
  dynasty: '🏛',
  callToArms: '📯',
  cultureSpread: '🎭',
  cultureMix: '🎭',
  cultureSplit: '🎭',
  built: '🏗',
  crab: '🦀',
  gift: '🎁',
};
