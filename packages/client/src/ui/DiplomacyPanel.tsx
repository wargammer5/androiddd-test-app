import { useEffect, useState } from 'preact/hooks';
import type { PanelProps } from './panels.ts';
import { t } from '../i18n.ts';

interface Info {
  wars: { id: number; attackers: string[]; defenders: string[]; cause: string; started: number; ended: number; casualties: [number, number]; captured: string[]; result: string; siege: number; goal: string }[];
  plots: { kingdom: string; type: string; leader: string; progress: number; members: number; target: string }[];
  alliances: [string, string][];
  routes: [string, string, number][];
  tributes: [string, string, number][];
  clans: { name: string; kingdom: string; members: number; prestige: number }[];
}

const year = (tick: number) => Math.floor(tick / 1440) + 1;

export function DiplomacyPanel({ session, onClose }: PanelProps) {
  const [d, setD] = useState<Info | null>(null);
  const [tab, setTab] = useState<'wars' | 'plots' | 'relations' | 'clans'>('wars');
  useEffect(() => {
    let alive = true;
    const load = () => session.query<Info>({ kind: 'diplomacy' }).then((x) => alive && setD(x));
    load();
    const iv = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  if (!d) return null;
  return (
    <div class="side-panel wide" data-testid="diplomacy-panel">
      <div class="panel-head">
        <b>⚔ {t('dip.title')}</b>
        <span class="grow" />
        <button onClick={onClose}>✕</button>
      </div>
      <div class="row">
        {(['wars', 'plots', 'relations', 'clans'] as const).map((k) => (
          <button key={k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t('dip.tab.' + k)}
          </button>
        ))}
      </div>
      {tab === 'wars' && (
        <div>
          {d.wars.length === 0 && <p class="muted small">{t('dip.noWars')}</p>}
          {d.wars.map((w) => (
            <div class="card" key={w.id}>
              <b>
                {w.attackers.join(', ')} ⚔ {w.defenders.join(', ')}
              </b>
              <div class="small muted">
                {t('dip.cause')}: {t('cause.' + w.cause)} · {t('hud.year', { y: year(w.started) })}
                {w.ended >= 0 ? ` – ${year(w.ended)}` : ''}
              </div>
              <div class="small">
                {t('dip.casualties')}: {w.casualties[0]} / {w.casualties[1]}
                {w.captured.length > 0 && ` · ${t('dip.captured')}: ${w.captured.join(', ')}`}
              </div>
              {w.ended < 0 ? (
                <div class="small">
                  {t('dip.siege')}: {w.goal || '—'} {w.siege > 0 ? `(${Math.round((w.siege / 12) * 100)}%)` : ''}
                </div>
              ) : (
                <div class="small">{t('result.' + w.result)}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {tab === 'plots' && (
        <div>
          {d.plots.length === 0 && <p class="muted small">{t('dip.noPlots')}</p>}
          {d.plots.map((p, k) => (
            <div class="card" key={k}>
              <b>
                {t('plot.' + p.type)} — {p.kingdom}
              </b>
              <div class="small">
                {t('dip.leader')}: {p.leader} · {t('dip.members')}: {p.members}
                {p.target && ` · ${t('dip.target')}: ${p.target}`}
              </div>
              <div class="bar">
                <span class="bar-t">
                  <span style={{ width: `${Math.round(p.progress * 100)}%`, background: '#b04ad0' }} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'relations' && (
        <div class="small">
          <h4>{t('dip.allies')}</h4>
          {d.alliances.length === 0 ? <p class="muted">—</p> : d.alliances.map(([a, b], k) => <div key={k}>🤝 {a} — {b}</div>)}
          <h4>{t('dip.routes')}</h4>
          {d.routes.length === 0 ? <p class="muted">—</p> : d.routes.map(([a, b, g], k) => <div key={k}>🐫 {a} → {b} ({g})</div>)}
          <h4>{t('dip.tribute')}</h4>
          {d.tributes.length === 0 ? <p class="muted">—</p> : d.tributes.map(([a, b, n], k) => <div key={k}>🪙 {a} → {b}: {n}/{t('dip.perDay')}</div>)}
        </div>
      )}
      {tab === 'clans' && (
        <div class="small">
          {d.clans.map((c, k) => (
            <div class="row" key={k} style={{ margin: '2px 0' }}>
              <span class="grow">
                <b>{t('dip.house', { x: c.name })}</b> <span class="muted">{c.kingdom}</span>
              </span>
              <span>
                👥 {c.members} · ✦ {c.prestige}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
