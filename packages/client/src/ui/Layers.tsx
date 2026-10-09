import { useState } from 'preact/hooks';
import type { GameSession } from '../game.ts';
import { useStore } from '../store.ts';
import { t } from '../i18n.ts';

export const LAYERS: { id: number; key: string; icon: string }[] = [
  { id: 0, key: 'layer.normal', icon: '🗺' },
  { id: 1, key: 'layer.political', icon: '🏳' },
  { id: 2, key: 'layer.culture', icon: '🎭' },
  { id: 3, key: 'layer.religion', icon: '⛩' },
  { id: 4, key: 'layer.temperature', icon: '🌡' },
  { id: 5, key: 'layer.biomes', icon: '🌿' },
];

export function Layers({ session, available }: { session: GameSession; available: number[] }) {
  const ov = useStore(session.overlay);
  const [open, setOpen] = useState(false);
  const cur = LAYERS.find((l) => l.id === ov) ?? LAYERS[0]!;
  return (
    <div class="layers">
      <button onClick={() => setOpen((o) => !o)} title={t('layer.title')} data-testid="btn-layers" class={ov ? 'on' : ''}>
        {cur.icon}
      </button>
      {open && (
        <div class="layers-pop">
          {LAYERS.filter((l) => available.includes(l.id)).map((l) => (
            <button
              key={l.id}
              class={ov === l.id ? 'on' : ''}
              data-testid={'layer-' + l.id}
              onClick={() => {
                session.overlay.set(l.id);
                setOpen(false);
              }}
            >
              {l.icon} {t(l.key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
