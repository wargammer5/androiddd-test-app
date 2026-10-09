import type { GameSession } from '../game.ts';
import { useStore } from '../store.ts';
import { t } from '../i18n.ts';

export function Hud({ session }: { session: GameSession; onOpen: (p: string) => void }) {
  const s = useStore(session.stats);
  const fps = useStore(session.fps);
  if (!s) return null;
  return (
    <div class="chip" data-testid="hud-stats">
      <span>
        {t('hud.year', { y: s.year + 1 })}, {t('hud.day', { d: s.day + 1 })}
      </span>
      <span class="muted small">{fps} fps</span>
    </div>
  );
}
