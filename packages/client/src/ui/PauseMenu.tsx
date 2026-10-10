import { useEffect, useState } from 'preact/hooks';
import type { GameSession } from '../game.ts';
import { t } from '../i18n.ts';
import { APP_STAGE, APP_VERSION } from '../version.ts';
import { AUTOSAVE_KEY, SLOT_KEYS, listSaves, readSave, writeSave, type SaveMeta } from '../saves.ts';
import { platform } from '../platform/index.ts';
import { SettingsForm } from './SettingsForm.tsx';
import { useStore } from '../store.ts';
import { canvasPng } from '../timelapse.ts';
import { TimelapseView } from './TimelapseView.tsx';

export function PauseMenu({ session, onClose, onExit, onLoad }: { session: GameSession; onClose: () => void; onExit: () => void; onLoad: (b: Uint8Array) => void }) {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<'main' | 'settings' | 'timelapse'>('main');
  const tl = useStore(session.timelapse.state);
  const screenshot = async () => {
    const c = session.canvasEl;
    if (!c) return;
    const png = await canvasPng(c);
    if (!png) return;
    const ok = await platform.exportFile(`sotvorenie-${session.info.seed}-${Date.now()}.png`, png, 'image/png');
    setMsg(ok ? t('shot.saved') : t('save.failed'));
  };
  const exportTimelapse = async () => {
    const ok = await platform.exportFile(`sotvorenie-timelapse-${Date.now()}.zip`, session.timelapse.zip(), 'application/zip');
    setMsg(ok ? t('save.exported') : t('save.failed'));
  };
  const refresh = () => listSaves().then(setSaves).catch(() => setSaves([]));
  useEffect(() => {
    refresh();
  }, []);
  const meta = () => {
    const st = session.stats.get();
    return { seed: session.info.seed, size: session.info.size, year: st?.year ?? 0, population: st?.population ?? 0 };
  };
  const saveTo = async (key: string) => {
    const b = await session.save();
    await writeSave(key, b, meta());
    setMsg(t('save.done'));
    refresh();
  };
  const loadFrom = async (key: string) => {
    const b = await readSave(key);
    if (b) onLoad(b);
  };
  const exportFile = async () => {
    const b = await session.save();
    const ok = await platform.exportFile(`sotvorenie-${session.info.seed}.sotv`, b, 'application/octet-stream');
    setMsg(ok ? t('save.exported') : t('save.failed'));
  };
  const importFile = async () => {
    const b = await platform.importFile('.sotv,application/octet-stream');
    if (b) onLoad(b);
  };
  const shareSeed = async () => {
    await platform.share(t('app.title'), t('share.seed', { seed: session.info.seed, size: t('size.' + session.info.size) }));
  };
  const find = (k: string) => saves.find((s) => s.key === k);
  if (view === 'timelapse') return <TimelapseView session={session} onClose={() => setView('main')} />;
  if (view === 'settings')
    return (
      <div class="modal-back" onClick={onClose}>
        <div class="panel" onClick={(e) => e.stopPropagation()}>
          <h2>{t('menu.settings')}</h2>
          <SettingsForm inGame />
          <button onClick={() => setView('main')}>{t('menu.back')}</button>
        </div>
      </div>
    );
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="panel" onClick={(e) => e.stopPropagation()} data-testid="pause-menu">
        <h2>{t('menu.pause')}</h2>
        <p class="muted small">
          v{APP_VERSION} · {t('about.stage')} {APP_STAGE} · {t('new.seed')}: {session.info.seed}
        </p>
        <h3>{t('save.slots')}</h3>
        {[AUTOSAVE_KEY, ...SLOT_KEYS].map((k, i) => {
          const m = find(k);
          return (
            <div class="row" key={k}>
              <span class="grow">
                {i === 0 ? t('save.auto') : t('save.slot', { n: i })}
                <br />
                <span class="muted small">{m ? `${new Date(m.savedAt).toLocaleString()} · ${m.seed} · ${(m.bytes / 1024).toFixed(0)} KB` : t('save.empty')}</span>
              </span>
              {i > 0 && (
                <button onClick={() => saveTo(k)} data-testid={'save-slot-' + i}>
                  💾
                </button>
              )}
              <button disabled={!m} onClick={() => loadFrom(k)} data-testid={'load-slot-' + i}>
                📂
              </button>
            </div>
          );
        })}
        {msg && <p class="small" data-testid="save-msg">{msg}</p>}
        <div class="row">
          <button onClick={exportFile}>{t('save.export')}</button>
          <button onClick={importFile}>{t('save.import')}</button>
          <button onClick={shareSeed}>{t('share.button')}</button>
        </div>
        <h3>{t('media.title')}</h3>
        <div class="row">
          <button onClick={screenshot} data-testid="btn-screenshot">
            📷 {t('shot.button')}
          </button>
          {tl.recording ? (
            <button class="on" onClick={() => session.timelapse.stop()} data-testid="btn-tl-stop">
              ⏹ {t('tl.stop')} ({tl.count})
            </button>
          ) : (
            <button onClick={() => session.timelapse.start()} data-testid="btn-tl-start">
              🎞 {t('tl.start')}
            </button>
          )}
          <button disabled={tl.count === 0} onClick={() => setView('timelapse')}>
            ▶ {t('tl.play')}
          </button>
          <button disabled={tl.count === 0} onClick={exportTimelapse}>
            💾 {t('tl.export')}
          </button>
        </div>
        <div class="menu-col" style={{ width: '100%' }}>
          <button class="primary" onClick={onClose}>
            {t('common.close')}
          </button>
          <button onClick={() => setView('settings')}>{t('menu.settings')}</button>
          <button onClick={onExit} data-testid="btn-exit">
            {t('menu.exitToMenu')}
          </button>
        </div>
      </div>
    </div>
  );
}
