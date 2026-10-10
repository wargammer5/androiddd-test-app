import { useState } from 'preact/hooks';
import type { GameSession } from '../game.ts';
import { useStore } from '../store.ts';
import { eventText, EVENT_ICON } from './eventText.ts';
import { t } from '../i18n.ts';

export function EventFeed({ session }: { session: GameSession }) {
  const events = useStore(session.events);
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const list = events.filter((e) => all || e.important).slice(-(open ? 6 : 1));
  if (list.length === 0) return null;
  return (
    <div class={'feed' + (open ? '' : ' closed')} data-testid="event-feed">
      <div class="feed-head">
        <button onClick={() => setOpen((o) => !o)} aria-label="feed">
          {open ? '▾' : '▸'}
        </button>
        {open && (
          <button class={all ? 'on' : ''} onClick={() => setAll((a) => !a)} title={t('feed.all')}>
            {t('feed.all')}
          </button>
        )}
      </div>
      {list.map((e, k) => (
        <div
          key={`${e.tick}-${k}`}
          class={'feed-item' + (e.important ? ' imp' : '')}
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
      ))}
    </div>
  );
}
