import type { GameSession } from '../game.ts';
import { useStore } from '../store.ts';
import { t } from '../i18n.ts';

export function MeasureOverlay({ session }: { session: GameSession }) {
  const m = useStore(session.measure);
  const tool = useStore(session.tool);
  if (tool.power !== 'measure') return null;
  const d = m.a && m.b ? Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) : null;
  return (
    <div class="measure chip" data-testid="measure">
      📏 {d === null ? t(m.a ? 'measure.second' : 'measure.first') : t('measure.result', { d: d.toFixed(1) })}
    </div>
  );
}
