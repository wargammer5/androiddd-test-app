import { useState } from 'preact/hooks';
import { t, useLang } from '../i18n.ts';
import type { Screen } from './App.tsx';
import type { WorldSizeKey } from '@sotv/sim';

function randomSeed(): string {
  const words = ['arka', 'velo', 'mira', 'tuno', 'sela', 'dorn', 'kiva', 'luma', 'ostra', 'rhen', 'zaja', 'pelo'];
  const a = words[Math.floor(Math.random() * words.length)]!;
  const b = words[Math.floor(Math.random() * words.length)]!;
  return `${a}-${b}-${Math.floor(Math.random() * 1000)}`;
}

export function NewWorld({ go }: { go: (s: Screen) => void }) {
  useLang();
  const [seed, setSeed] = useState(randomSeed());
  const [size, setSize] = useState<WorldSizeKey>('medium');
  return (
    <div class="screen" data-testid="new-world">
      <div class="panel">
        <h2>{t('menu.new')}</h2>
        <div class="row">
          <label>{t('new.seed')}</label>
          <input class="grow" value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} data-testid="seed-input" />
          <button onClick={() => setSeed(randomSeed())}>🎲</button>
        </div>
        <div class="row">
          <label>{t('new.size')}</label>
          {(['small', 'medium', 'large', 'huge'] as WorldSizeKey[]).map((k) => (
            <button key={k} class={size === k ? 'on' : ''} onClick={() => setSize(k)} data-testid={'size-' + k}>
              {t('size.' + k)}
            </button>
          ))}
        </div>
        <div class="row">
          <button onClick={() => go({ id: 'menu' })}>{t('menu.back')}</button>
          <span class="grow" />
          <button class="primary" data-testid="btn-create" onClick={() => go({ id: 'game', params: { seed: seed.trim() || randomSeed(), size } })}>
            {t('new.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
