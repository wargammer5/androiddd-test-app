import { useEffect, useState } from 'preact/hooks';
import type { PanelProps } from './panels.ts';
import { t } from '../i18n.ts';
import { LineChart, color, type Series } from './Chart.tsx';

interface Sample {
  tick: number;
  pop: number;
  creatures: number;
  cities: number;
  kingdoms: number;
  wars: number;
  plants: number;
  species: number[];
  kingdomPop: Record<string, number>;
  religion: Record<string, number>;
  culture: Record<string, number>;
}

interface Info {
  samples: Sample[];
  species: { key: string; kind: string }[];
}

const year = (tick: number) => t('hud.year', { y: Math.floor(tick / 1440) + 1 });

function byName(samples: Sample[], pick: (s: Sample) => Record<string, number>): Series[] {
  const names = new Map<string, number>();
  for (const s of samples) for (const [k, v] of Object.entries(pick(s))) names.set(k, Math.max(names.get(k) ?? 0, v));
  return [...names.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name], k) => ({ name, color: color(k), values: samples.map((s) => pick(s)[name] ?? 0) }));
}

export function StatsPanel({ session, onClose }: PanelProps) {
  const [d, setD] = useState<Info | null>(null);
  const [tab, setTab] = useState<'world' | 'kingdoms' | 'species' | 'faiths'>('world');
  useEffect(() => {
    let alive = true;
    const load = () => session.query<Info>({ kind: 'stats' }).then((x) => alive && setD(x));
    load();
    const iv = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  if (!d) return null;
  const s = d.samples;
  const labels: [string, string] | undefined = s.length ? [year(s[0]!.tick), year(s[s.length - 1]!.tick)] : undefined;
  const last = s[s.length - 1];
  return (
    <div class="side-panel wide" data-testid="stats-panel">
      <div class="panel-head">
        <b>📊 {t('stats.title')}</b>
        <span class="grow" />
        <button onClick={onClose}>✕</button>
      </div>
      <div class="row">
        {(['world', 'kingdoms', 'species', 'faiths'] as const).map((k) => (
          <button key={k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-testid={'stats-' + k}>
            {t('stats.' + k)}
          </button>
        ))}
      </div>
      {s.length < 2 && <p class="muted small">{t('stats.wait')}</p>}
      {s.length >= 2 && tab === 'world' && (
        <>
          <LineChart labels={labels} series={[{ name: t('hud.population'), color: color(0), values: s.map((x) => x.pop) }, { name: t('stats.creatures'), color: color(1), values: s.map((x) => x.creatures) }]} />
          <LineChart labels={labels} height={90} series={[{ name: t('stats.cities'), color: color(2), values: s.map((x) => x.cities) }, { name: t('kingdom.list'), color: color(3), values: s.map((x) => x.kingdoms) }, { name: t('dip.tab.wars'), color: color(4), values: s.map((x) => x.wars) }]} />
          <LineChart labels={labels} height={80} series={[{ name: t('stats.plants'), color: color(2), values: s.map((x) => x.plants) }]} />
        </>
      )}
      {s.length >= 2 && tab === 'kingdoms' && <LineChart labels={labels} height={170} series={byName(s, (x) => x.kingdomPop)} />}
      {s.length >= 2 && tab === 'faiths' && (
        <>
          <h4>{t('bel.religions')}</h4>
          <LineChart labels={labels} series={byName(s, (x) => x.religion)} />
          <h4>{t('bel.cultures')}</h4>
          <LineChart labels={labels} series={byName(s, (x) => x.culture)} />
        </>
      )}
      {s.length >= 2 && tab === 'species' && last && (
        <>
          <LineChart
            labels={labels}
            height={150}
            series={d.species
              .map((sp, k) => ({ sp, k, v: last.species[k] ?? 0 }))
              .filter((x) => x.sp.kind === 'animal')
              .sort((a, b) => b.v - a.v)
              .slice(0, 6)
              .map((x, n) => ({ name: t('species.' + x.sp.key), color: color(n), values: s.map((y) => y.species[x.k] ?? 0) }))}
          />
          <div class="species-grid">
            {d.species.map((sp, k) => (
              <div key={sp.key} class="small">
                {t('species.' + sp.key)}: <b>{last.species[k] ?? 0}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
