import { useEffect, useState } from 'preact/hooks';
import type { PanelProps } from './panels.ts';
import { t } from '../i18n.ts';
import { Flag, type FlagSpec } from './Flag.tsx';
import { KingdomPanel } from './KingdomPanel.tsx';
import { CityPanel } from './CityPanel.tsx';

interface Row extends FlagSpec {
  id: number;
  name: string;
  race: string;
  cities: number;
  pop: number;
  army: number;
  ruler: string;
}

export function KingdomList({ session, onClose }: PanelProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [city, setCity] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => session.query<{ kingdoms: Row[] }>({ kind: 'lists' }).then((d) => alive && setRows(d.kingdoms.sort((a, b) => b.pop - a.pop)));
    load();
    const iv = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  if (city !== null) return <CityPanel session={session} id={city} onClose={() => setCity(null)} />;
  if (sel !== null) return <KingdomPanel session={session} id={sel} onClose={() => setSel(null)} onCity={setCity} />;
  return (
    <div class="side-panel" data-testid="kingdom-list">
      <div class="panel-head">
        <b>🏳 {t('kingdom.list')}</b>
        <span class="grow" />
        <button onClick={onClose}>✕</button>
      </div>
      {rows.length === 0 && <p class="muted small">{t('kingdom.none')}</p>}
      {rows.map((r) => (
        <div class="row list-row" key={r.id} onClick={() => setSel(r.id)}>
          <Flag spec={r} w={27} h={18} />
          <span class="grow">
            <b>{r.name}</b>
            <br />
            <span class="small muted">
              {t('species.' + r.race)} · 👑 {r.ruler || '—'}
            </span>
          </span>
          <span class="small">
            🏰 {r.cities} · 👥 {r.pop} · ⚔ {r.army}
          </span>
        </div>
      ))}
    </div>
  );
}
