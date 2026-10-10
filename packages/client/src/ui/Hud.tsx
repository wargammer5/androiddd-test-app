import type { GameSession } from '../game.ts';
import { useStore } from '../store.ts';
import { t } from '../i18n.ts';

const WEATHER = ['weather.clear', 'weather.rain', 'weather.snow', 'weather.storm'];
const AGE_ICON: Record<string, string> = { prosperity: '🌾', darkness: '🌑', chaos: '🌀', ice: '🧊', fire: '🔥', madness: '😵', magic: '🔮' };

export function Hud({ session }: { session: GameSession; onOpen: (p: string) => void }) {
  const s = useStore(session.stats);
  const fps = useStore(session.fps);
  if (!s) return null;
  return (
    <div class="chip" data-testid="hud-stats">
      <span>
        {t('hud.year', { y: s.year + 1 })}, {t('season.' + s.season)} {t('hud.day', { d: (s.day % 2) + 1 })}
      </span>
      <span title={t(WEATHER[s.weather] ?? 'weather.clear')}>{['☀', '🌧', '🌨', '⛈'][s.weather] ?? '☀'}</span>
      {s.worldAge !== 'calm' && (
        <span class="small" title={t('age.' + s.worldAge)} data-testid="hud-age">
          {AGE_ICON[s.worldAge] ?? ''} {t('age.' + s.worldAge)}
        </span>
      )}
      <span title={t('hud.population')}>👥 {s.population}</span>
      <span class="muted small" data-testid="hud-cities">
        🏰 {s.cities}
      </span>
      <span class="muted small">🐾 {s.creatures}</span>
      <span class="muted small">{fps} fps</span>
    </div>
  );
}
