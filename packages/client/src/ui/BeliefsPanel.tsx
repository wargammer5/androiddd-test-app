import { useEffect, useState } from 'preact/hooks';
import type { PanelProps } from './panels.ts';
import type { GameSession } from '../game.ts';
import { t } from '../i18n.ts';

const CULTURE_TRAITS = ['militant', 'mercantile', 'scholarly', 'agrarian', 'seafaring', 'artisan', 'xenophobic', 'tolerant', 'nomadic', 'builders'];
const TENETS = ['war', 'harvest', 'sea', 'sun', 'death', 'fire', 'wisdom', 'peace', 'nature', 'sky'];

interface ListInfo {
  cultures: { id: number; name: string; color: number[]; members: number; cities: number; traits: string[] }[];
  religions: { id: number; name: string; color: number[]; followers: number; cities: number; tenets: string[]; deity: string }[];
}

const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const toHex = (c: number[]) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function BeliefsPanel({ session, onClose }: PanelProps) {
  const [d, setD] = useState<ListInfo | null>(null);
  const [sel, setSel] = useState<{ kind: 'culture' | 'religion'; id: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => session.query<ListInfo>({ kind: 'lists' }).then((x) => alive && setD(x));
    load();
    const iv = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  if (sel) return <BeliefEditor session={session} kind={sel.kind} id={sel.id} onClose={() => setSel(null)} />;
  if (!d) return null;
  return (
    <div class="side-panel wide" data-testid="beliefs-panel">
      <div class="panel-head">
        <b>🎭 {t('bel.title')}</b>
        <span class="grow" />
        <button onClick={onClose}>✕</button>
      </div>
      <h4>{t('bel.cultures')}</h4>
      {d.cultures.length === 0 && <p class="muted small">—</p>}
      {d.cultures.map((c) => (
        <div class="row list-row" key={c.id} onClick={() => setSel({ kind: 'culture', id: c.id })}>
          <span class="swatch" style={{ background: rgb(c.color) }} />
          <span class="grow">
            <b>{c.name}</b>
            <br />
            <span class="small muted">{c.traits.map((x) => t('ctrait.' + x)).join(', ')}</span>
          </span>
          <span class="small">
            🏰 {c.cities} · 👥 {c.members}
          </span>
        </div>
      ))}
      <h4>{t('bel.religions')}</h4>
      {d.religions.length === 0 && <p class="muted small">{t('bel.noReligions')}</p>}
      {d.religions.map((r) => (
        <div class="row list-row" key={r.id} onClick={() => setSel({ kind: 'religion', id: r.id })} data-testid="religion-row">
          <span class="swatch" style={{ background: rgb(r.color) }} />
          <span class="grow">
            <b>{r.name}</b>
            <br />
            <span class="small muted">
              {r.deity} · {r.tenets.map((x) => t('tenet.' + x)).join(', ')}
            </span>
          </span>
          <span class="small">
            🏰 {r.cities} · 👥 {r.followers}
          </span>
        </div>
      ))}
    </div>
  );
}

interface Detail {
  id: number;
  name: string;
  color: number[];
  traits?: string[];
  tenets?: string[];
  deity?: string;
  parentName: string;
  cityNames: string[];
  founder?: string;
  holyCityName?: string;
  language?: { id: number; name: string; consonants: string[]; vowels: string[]; sample: string[] };
}

function BeliefEditor({ session, kind, id, onClose }: { session: GameSession; kind: 'culture' | 'religion'; id: number; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [cons, setCons] = useState('');
  const [vows, setVows] = useState('');
  const [langName, setLangName] = useState('');
  const load = () =>
    session.query<Detail | null>({ kind, id }).then((x) => {
      setD(x);
      if (x) {
        setName(x.name);
        setExtra(x.deity ?? '');
        if (x.language) {
          setCons(x.language.consonants.join(' '));
          setVows(x.language.vowels.join(' '));
          setLangName(x.language.name);
        }
      }
    });
  useEffect(() => {
    load();
  }, [id]);
  if (!d) return null;
  const list = kind === 'culture' ? CULTURE_TRAITS : TENETS;
  const current = (kind === 'culture' ? d.traits : d.tenets) ?? [];
  const send = (data: Record<string, unknown>) => {
    session.cmd({ t: 'edit', kind, id, data });
    setTimeout(load, 200);
  };
  const toggle = (x: string) => {
    const next = current.includes(x) ? current.filter((y) => y !== x) : [...current, x].slice(-4);
    send({ [kind === 'culture' ? 'traits' : 'tenets']: next });
  };
  return (
    <div class="side-panel wide" data-testid="belief-editor">
      <div class="panel-head">
        <span class="swatch" style={{ background: rgb(d.color) }} />
        <b>{d.name}</b>
        <span class="muted small">{t(kind === 'culture' ? 'bel.culture' : 'bel.religion')}</span>
        <span class="grow" />
        <button onClick={onClose}>✕</button>
      </div>
      <div class="kv">
        {d.parentName && (
          <>
            <span>{t('bel.parent')}</span>
            <b>{d.parentName}</b>
          </>
        )}
        {d.founder && (
          <>
            <span>{t('bel.founder')}</span>
            <b>{d.founder}</b>
          </>
        )}
        {d.holyCityName && (
          <>
            <span>{t('bel.holyCity')}</span>
            <b>{d.holyCityName}</b>
          </>
        )}
        <span>{t('kingdom.cities')}</span>
        <b>{d.cityNames.join(', ') || '—'}</b>
      </div>
      <h4>{t('bel.edit')}</h4>
      <div class="row">
        <input class="grow" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} aria-label={t('bel.name')} />
        <input type="color" value={toHex(d.color)} onChange={(e) => send({ color: fromHex((e.target as HTMLInputElement).value) })} />
      </div>
      {kind === 'religion' && (
        <div class="row">
          <label>{t('bel.deity')}</label>
          <input class="grow" value={extra} onInput={(e) => setExtra((e.target as HTMLInputElement).value)} />
        </div>
      )}
      <button onClick={() => send(kind === 'religion' ? { name, deity: extra } : { name })} data-testid="belief-save">
        {t('bel.apply')}
      </button>
      <h4>{t(kind === 'culture' ? 'bel.traits' : 'bel.tenets')}</h4>
      <div class="chips">
        {list.map((x) => (
          <button key={x} class={current.includes(x) ? 'on' : ''} onClick={() => toggle(x)} style={{ minHeight: '40px' }}>
            {t((kind === 'culture' ? 'ctrait.' : 'tenet.') + x)}
          </button>
        ))}
      </div>
      <p class="small muted">{t(kind === 'culture' ? 'bel.traitsHint' : 'bel.tenetsHint')}</p>
      {d.language && (
        <>
          <h4>
            {t('bel.language')}: {d.language.name}
          </h4>
          <div class="small muted">
            {t('bel.sample')}: {d.language.sample.join(', ')}
          </div>
          <div class="row">
            <label>{t('bel.name')}</label>
            <input class="grow" value={langName} onInput={(e) => setLangName((e.target as HTMLInputElement).value)} />
          </div>
          <div class="row">
            <label>{t('bel.consonants')}</label>
            <input class="grow" value={cons} onInput={(e) => setCons((e.target as HTMLInputElement).value)} />
          </div>
          <div class="row">
            <label>{t('bel.vowels')}</label>
            <input class="grow" value={vows} onInput={(e) => setVows((e.target as HTMLInputElement).value)} />
          </div>
          <button
            onClick={() => {
              session.cmd({ t: 'edit', kind: 'language', id: d.language!.id, data: { name: langName, consonants: cons, vowels: vows } });
              setTimeout(load, 200);
            }}
          >
            {t('bel.apply')}
          </button>
        </>
      )}
    </div>
  );
}
