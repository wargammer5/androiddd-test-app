import { useEffect, useState } from 'preact/hooks';
import type { GameSession } from '../game.ts';
import type { UnitCardData } from '@sotv/sim';
import { t } from '../i18n.ts';

function Bar({ v, color, label }: { v: number; color: string; label: string }) {
  return (
    <div class="bar" title={label}>
      <span class="bar-l">{label}</span>
      <span class="bar-t">
        <span style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, background: color }} />
      </span>
    </div>
  );
}

export function historyText(h: string): string {
  const [kind, a, b] = h.split(':');
  if (kind === 'kill') return t('hist.kill', { name: a ?? '' });
  if (kind === 'event') return t(a ?? '', { x: b ?? '' });
  return h;
}

export function UnitCard({ session, id, onClose }: { session: GameSession; id: number; onClose: () => void }) {
  const [u, setU] = useState<UnitCardData | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      session.query<UnitCardData | null>({ kind: 'unit', id }).then((d) => {
        if (!alive) return;
        if (d) setU(d);
        else setGone(true);
      });
    load();
    const iv = setInterval(load, 500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [id]);
  if (gone && !u) return null;
  if (!u) return <div class="side-panel">{t('common.loading')}</div>;
  const follow = () => {
    session.cmd({ t: 'debug', key: 'follow', value: id });
    session.followCam = true;
    session.cam.zoom = Math.max(session.cam.zoom, 10);
  };
  const title = u.name || t('species.' + u.species);
  return (
    <div class="side-panel unit-card" data-testid="unit-card">
      <div class="panel-head">
        <b>{title}</b>
        <span class="muted small">
          {u.name ? t('species.' + u.species) : ''} {u.sex ? '♀' : '♂'}
        </span>
        <span class="grow" />
        <button
          class={u.favorite ? 'on' : ''}
          onClick={() => {
            session.cmd({ t: 'favorite', id, on: !u.favorite });
            setU({ ...u, favorite: !u.favorite });
          }}
          title={t('unit.favorite')}
        >
          ★
        </button>
        <button onClick={follow} title={t('unit.follow')} data-testid="btn-follow">
          👁
        </button>
        <button onClick={onClose}>✕</button>
      </div>
      {gone && <p class="small" style={{ color: 'var(--danger)' }}>{t('unit.dead')}</p>}
      <Bar v={u.hp / u.maxHp} color="#d9534f" label={`❤ ${u.hp}/${u.maxHp}`} />
      <div class="kv">
        <span>{t('unit.age')}</span>
        <b>{u.age}</b>
        <span>{t('unit.level')}</span>
        <b>
          {u.level} ({u.xp} xp)
        </b>
        <span>{t('unit.task')}</span>
        <b>{t('task.' + u.task)}</b>
        <span>{t('unit.stats')}</span>
        <b>
          ⚔ {u.dmg} · 🛡 {u.armor} · 👟 {u.speed} · 👁 {u.vision} · ✦ {u.crit}%
        </b>
        <span>{t('unit.kills')}</span>
        <b>{u.kills}</b>
        <span>{t('unit.children')}</span>
        <b>{u.children}</b>
        {(u.mother || u.father) && (
          <>
            <span>{t('unit.parents')}</span>
            <b>{[u.mother, u.father].filter(Boolean).join(', ')}</b>
          </>
        )}
        {u.extra &&
          Object.entries(u.extra).map(([k, v]) => (
            <>
              <span>{t(k)}</span>
              <b>{typeof v === 'string' && v.includes('.') && !v.includes(' ') ? t(v) : String(v)}</b>
            </>
          ))}
      </div>
      <div class="traits">
        {u.traits.map((tr) => (
          <span class="trait" key={tr}>
            {t('trait.' + tr)}
          </span>
        ))}
      </div>
      <Bar v={1 - u.hunger} color="#e0a040" label={t('need.food')} />
      <Bar v={u.energy} color="#6aa0e0" label={t('need.energy')} />
      <Bar v={1 - u.fatigue} color="#70c070" label={t('need.rest')} />
      <Bar v={1 - u.social} color="#c070c0" label={t('need.social')} />
      <Bar v={u.mood} color="#e8d860" label={t('need.mood')} />
      {u.history.length > 0 && (
        <div class="small muted">
          {u.history
            .slice()
            .reverse()
            .map((h, k) => (
              <div key={k}>• {historyText(h)}</div>
            ))}
        </div>
      )}
    </div>
  );
}
