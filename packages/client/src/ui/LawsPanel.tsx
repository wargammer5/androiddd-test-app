import { useEffect, useState } from 'preact/hooks';
import type { PanelProps } from './panels.ts';
import { t } from '../i18n.ts';

type Laws = Record<string, boolean | number | string>;
const TOGGLES = ['disasters', 'aging', 'reproduction', 'hunger', 'wars', 'rebellions', 'cityGrowth', 'ai', 'religions', 'worldAges'];
const PROFILES = ['garden', 'classic', 'chaos', 'apocalypse'];

export function LawsPanel({ session, onClose }: PanelProps) {
  const [laws, setLaws] = useState<Laws | null>(null);
  const [age, setAge] = useState<{ age: string; ageUntil: number } | null>(null);
  const load = () => {
    session.query<Laws>({ kind: 'laws' }).then(setLaws);
    session.query<{ age: string; ageUntil: number }>({ kind: 'history' }).then(setAge);
  };
  useEffect(() => {
    load();
  }, []);
  if (!laws) return null;
  const set = (key: string, value: boolean | number | string) => {
    session.cmd({ t: 'law', key, value });
    setLaws({ ...laws, [key]: value });
  };
  return (
    <div class="side-panel wide" data-testid="laws-panel">
      <div class="panel-head">
        <b>📜 {t('laws.title')}</b>
        <span class="grow" />
        <button onClick={onClose}>✕</button>
      </div>
      <h4>{t('laws.profiles')}</h4>
      <div class="chips">
        {PROFILES.map((p) => (
          <button
            key={p}
            onClick={() => {
              session.cmd({ t: 'profile', key: p });
              setTimeout(load, 200);
            }}
            data-testid={'profile-' + p}
          >
            {t('profile.' + p)}
          </button>
        ))}
      </div>
      <h4>{t('laws.rules')}</h4>
      {TOGGLES.map((k) => (
        <div class="row" key={k} style={{ margin: '2px 0' }}>
          <span class="grow">{t('law.' + k)}</span>
          <button class={laws[k] ? 'on' : ''} onClick={() => set(k, !laws[k])} data-testid={'law-' + k}>
            {laws[k] ? t('common.on') : t('common.off')}
          </button>
        </div>
      ))}
      <div class="row">
        <span class="grow">{t('law.eventFrequency')}</span>
        <input type="range" min={0} max={4} step={0.25} value={Number(laws.eventFrequency)} onChange={(e) => set('eventFrequency', Number((e.target as HTMLInputElement).value))} />
        <span class="small">×{Number(laws.eventFrequency).toFixed(2)}</span>
      </div>
      <div class="row">
        <span class="grow">{t('settings.ecosystem')}</span>
        {['off', 'slow', 'normal', 'fast'].map((k) => (
          <button key={k} class={laws.ecosystem === k ? 'on' : ''} onClick={() => set('ecosystem', k)} style={{ minWidth: '40px' }}>
            {t('eco.' + k)}
          </button>
        ))}
      </div>
      {age && (
        <p class="small muted">
          {t('laws.currentAge')}: <b>{t('age.' + age.age)}</b>
        </p>
      )}
    </div>
  );
}
