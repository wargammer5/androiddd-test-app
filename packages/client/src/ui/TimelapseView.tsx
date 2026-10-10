import { useEffect, useState } from 'preact/hooks';
import type { GameSession } from '../game.ts';
import { t } from '../i18n.ts';

export function TimelapseView({ session, onClose }: { session: GameSession; onClose: () => void }) {
  const [urls] = useState(() => session.timelapse.urls());
  const [k, setK] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setK((x) => (urls.length ? (x + 1) % urls.length : 0)), 160);
    return () => {
      clearInterval(iv);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="panel" onClick={(e) => e.stopPropagation()} data-testid="timelapse-view">
        <h2>🎞 {t('tl.title')}</h2>
        {urls.length ? <img src={urls[k]} style={{ width: '100%', imageRendering: 'pixelated' }} alt="" /> : <p class="muted">{t('tl.empty')}</p>}
        <p class="small muted">
          {k + 1} / {urls.length}
        </p>
        <button onClick={onClose}>{t('common.close')}</button>
      </div>
    </div>
  );
}
