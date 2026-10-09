import { useEffect, useState } from 'preact/hooks';
import type { GameSession } from '../game.ts';
import { t } from '../i18n.ts';
import { Flag, type FlagSpec } from './Flag.tsx';

interface KingdomInfo extends FlagSpec {
  id: number;
  name: string;
  raceKey: string;
  alive: boolean;
  ruler: number;
  rulerName: string;
  rulers: number;
  treasury: number;
  army: number;
  pop: number;
  founded: number;
  history: string[];
  cityList: ({ id: number; name: string; pop: number; loyalty: number; capital: boolean } | null)[];
  extraInfo: Record<string, string | number>;
}

export function historyLine(h: string): string {
  const [tick, kind, ...rest] = h.split(':');
  const arg = rest.join(':');
  const year = Math.floor(Number(tick) / 1440) + 1;
  return `${t('hud.year', { y: year })}: ${t('khist.' + kind, { x: arg })}`;
}

export function KingdomPanel({ session, id, onClose, onCity }: { session: GameSession; id: number; onClose: () => void; onCity?: (id: number) => void }) {
  const [k, setK] = useState<KingdomInfo | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => session.query<KingdomInfo | null>({ kind: 'kingdom', id }).then((d) => alive && setK(d));
    load();
    const iv = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [id]);
  if (!k) return null;
  return (
    <div class="side-panel" data-testid="kingdom-panel">
      <div class="panel-head">
        <Flag spec={k} />
        <b>{k.name}</b>
        <span class="muted small">{t('species.' + k.raceKey)}</span>
        <span class="grow" />
        <button onClick={onClose}>✕</button>
      </div>
      {!k.alive && <p class="small" style={{ color: 'var(--danger)' }}>{t('kingdom.fallen')}</p>}
      <div class="kv">
        <span>{t('kingdom.ruler')}</span>
        <b>
          {k.ruler >= 0 ? (
            <a class="link" onClick={() => session.query<{ x: number; y: number } | null>({ kind: 'unit', id: k.ruler }).then((u) => u && session.inspect.set({ x: Math.floor(u.x), y: Math.floor(u.y), at: performance.now() }))}>
              👑 {k.rulerName}
            </a>
          ) : (
            '—'
          )}
        </b>
        <span>{t('hud.population')}</span>
        <b>{k.pop}</b>
        <span>{t('kingdom.army')}</span>
        <b>{k.army}</b>
        <span>{t('kingdom.treasury')}</span>
        <b>{Math.floor(k.treasury)} 🪙</b>
        {Object.entries(k.extraInfo).map(([key, v]) => (
          <>
            <span>{t(key)}</span>
            <b>{typeof v === 'string' && v.startsWith('$') ? v.slice(1) : String(v)}</b>
          </>
        ))}
      </div>
      <h4>{t('kingdom.cities')}</h4>
      {k.cityList.filter(Boolean).map((c) => (
        <div class="row" style={{ margin: '2px 0' }} key={c!.id}>
          <a class="link grow" onClick={() => onCity?.(c!.id)}>
            {c!.capital ? '★ ' : ''}
            {c!.name}
          </a>
          <span class="small muted">
            👥 {c!.pop} · {t('city.loyalty')} {c!.loyalty}%
          </span>
        </div>
      ))}
      {k.history.length > 0 && (
        <>
          <h4>{t('kingdom.history')}</h4>
          <div class="small muted">
            {k.history
              .slice(-10)
              .reverse()
              .map((h, n) => (
                <div key={n}>• {historyLine(h)}</div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
