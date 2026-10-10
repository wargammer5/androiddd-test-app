import { useEffect, useState } from 'preact/hooks';
import type { PanelProps } from './panels.ts';
import type { SimEvent } from '@sotv/sim';
import { t } from '../i18n.ts';
import { eventText, EVENT_ICON } from './eventText.ts';

const FILTERS: Record<string, string[]> = {
  all: [],
  wars: ['war', 'peace', 'alliance', 'betrayal', 'capture', 'callToArms', 'rebellion'],
  realms: ['city', 'cityRuined', 'colonyFounded', 'kingdomFell', 'ruler', 'coup', 'dynasty', 'era'],
  faith: ['religion', 'schism', 'conversion', 'cultureSpread', 'cultureMix', 'cultureSplit'],
  nature: ['age', 'drought', 'flood', 'plague', 'famine', 'earthquake', 'volcano', 'comet', 'invasion', 'wildfire'],
};

export function ChroniclePanel({ session, onClose }: PanelProps) {
  const [entries, setEntries] = useState<SimEvent[]>([]);
  const [f, setF] = useState('all');
  useEffect(() => {
    session.query<{ entries: SimEvent[] }>({ kind: 'stats' }).then((d) => setEntries(d.entries));
  }, []);
  const list = entries.filter((e) => f === 'all' || FILTERS[f]!.includes(e.kind)).reverse();
  let lastYear = -1;
  return (
    <div class="side-panel wide" data-testid="chronicle-panel">
      <div class="panel-head">
        <b>📖 {t('chron.title')}</b>
        <span class="grow" />
        <button onClick={onClose}>✕</button>
      </div>
      <div class="row">
        {Object.keys(FILTERS).map((k) => (
          <button key={k} class={f === k ? 'on' : ''} onClick={() => setF(k)}>
            {t('chron.' + k)}
          </button>
        ))}
      </div>
      {list.length === 0 && <p class="muted small">{t('chron.empty')}</p>}
      {list.map((e, k) => {
        const y = Math.floor(e.tick / 1440) + 1;
        const head = y !== lastYear;
        lastYear = y;
        return (
          <div key={k}>
            {head && <h4>{t('hud.year', { y })}</h4>}
            <div
              class="feed-item imp"
              onClick={() => {
                if (e.x !== undefined && e.y !== undefined) {
                  session.followCam = false;
                  session.centerOn(e.x, e.y, Math.max(session.cam.zoom, 6));
                }
              }}
            >
              <span class="feed-icon">{EVENT_ICON[e.kind] ?? '•'}</span>
              <span>{eventText(e)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
