import { useState } from 'preact/hooks';
import { t } from '../i18n.ts';

export const WINDOWS: { id: string; icon: string; key: string }[] = [
  { id: 'kingdoms', icon: '👑', key: 'kingdom.list' },
  { id: 'diplomacy', icon: '⚔', key: 'dip.title' },
  { id: 'beliefs', icon: '🎭', key: 'bel.title' },
  { id: 'stats', icon: '📊', key: 'stats.title' },
  { id: 'chronicle', icon: '📖', key: 'chron.title' },
  { id: 'laws', icon: '📜', key: 'laws.title' },
];

export function WindowsMenu({ current, open }: { current: string | null; open: (id: string | null) => void }) {
  const [pop, setPop] = useState(false);
  const toggle = (id: string) => open(current === id ? null : id);
  return (
    <>
      <span class="win-inline">
        {WINDOWS.map((w) => (
          <button key={w.id} class={current === w.id ? 'on' : ''} onClick={() => toggle(w.id)} data-testid={'btn-' + w.id} title={t(w.key)} aria-label={t(w.key)}>
            {w.icon}
          </button>
        ))}
      </span>
      <span class="win-menu layers">
        <button onClick={() => setPop((p) => !p)} data-testid="btn-windows" aria-label="windows" class={current ? 'on' : ''}>
          🗂
        </button>
        {pop && (
          <div class="layers-pop">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                class={current === w.id ? 'on' : ''}
                data-testid={'menu-' + w.id}
                onClick={() => {
                  toggle(w.id);
                  setPop(false);
                }}
              >
                {w.icon} {t(w.key)}
              </button>
            ))}
          </div>
        )}
      </span>
    </>
  );
}
