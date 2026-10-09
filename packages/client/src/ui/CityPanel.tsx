import { useEffect, useState } from 'preact/hooks';
import type { GameSession } from '../game.ts';
import { t } from '../i18n.ts';

export interface CityInfo {
  id: number;
  name: string;
  race: string;
  kingdom: number;
  pop: number;
  housing: number;
  era: string;
  techs: string[];
  research: string | null;
  store: Record<string, number>;
  capacity: number;
  buildings: Record<string, number>;
  queue: { key: string; progress: number; funded: boolean }[];
  stall: string | null;
  jobs: number[];
  wantJobs: number[];
  founded: number;
  happiness: number;
  loyalty: number;
  x: number;
  y: number;
  ledgerErrors: string[];
  extra?: Record<string, string | number>;
}

export function CityPanel({ session, id, onClose }: { session: GameSession; id: number; onClose: () => void }) {
  const [c, setC] = useState<CityInfo | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => session.query<CityInfo | null>({ kind: 'city', id }).then((d) => alive && setC(d));
    load();
    const iv = setInterval(load, 1000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [id]);
  if (!c) return null;
  return (
    <div class="side-panel" data-testid="city-panel">
      <div class="panel-head">
        <b>🏰 {c.name}</b>
        <span class="muted small">{t('species.' + c.race)}</span>
        <span class="grow" />
        <button onClick={() => session.centerOn(c.x, c.y, Math.max(session.cam.zoom, 8))}>🎯</button>
        <button onClick={onClose}>✕</button>
      </div>
      <div class="kv">
        <span>{t('city.pop')}</span>
        <b>
          {c.pop} / {c.housing} {t('city.housing').toLowerCase()}
        </b>
        <span>{t('city.era')}</span>
        <b>{t('era.' + c.era)}</b>
        <span>{t('city.research')}</span>
        <b>{c.research ? t('tech.' + c.research) : '—'}</b>
        {c.extra &&
          Object.entries(c.extra).map(([k, v]) => (
            <>
              <span>{t(k)}</span>
              <b>{typeof v === 'string' ? t(v) : v}</b>
            </>
          ))}
      </div>
      <h4>
        {t('city.store')} ({Object.entries(c.store).reduce((a, [k, v]) => (k === 'knowledge' ? a : a + v), 0)}/{c.capacity})
      </h4>
      <div class="chips">
        {Object.entries(c.store)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => (
            <span class="trait" key={k}>
              {t('res.' + k)}: {v}
            </span>
          ))}
      </div>
      <h4>{t('city.buildings')}</h4>
      <div class="chips">
        {Object.entries(c.buildings).map(([k, v]) => (
          <span class="trait" key={k}>
            {t('bld.' + k)} ×{v}
          </span>
        ))}
      </div>
      {c.queue.length > 0 && (
        <>
          <h4>{t('city.queue')}</h4>
          {c.queue.map((q, k) => (
            <div class="bar" key={k}>
              <span class="bar-l">
                {t('bld.' + q.key)}
                {!q.funded && <span style={{ color: 'var(--danger)' }}> · {t('city.stalled')}</span>}
              </span>
              <span class="bar-t">
                <span style={{ width: `${Math.round(q.progress * 100)}%`, background: '#c9a24a' }} />
              </span>
            </div>
          ))}
        </>
      )}
      <h4>{t('city.jobs')}</h4>
      <div class="chips">
        {c.jobs.map((n, j) =>
          j > 0 && (n > 0 || c.wantJobs[j]! > 0) ? (
            <span class="trait" key={j}>
              {t('job.' + j)}: {n}
            </span>
          ) : null,
        )}
      </div>
      {c.techs.length > 0 && (
        <div class="small muted" style={{ marginTop: '6px' }}>
          {c.techs.map((k) => t('tech.' + k)).join(' · ')}
        </div>
      )}
      {c.ledgerErrors.length > 0 && <div class="small" style={{ color: 'var(--danger)' }}>{c.ledgerErrors.join('; ')}</div>}
    </div>
  );
}
