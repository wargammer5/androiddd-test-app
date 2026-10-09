import { useEffect, useRef, useState } from 'preact/hooks';
import { GameSession, SPEEDS } from '../game.ts';
import { useStore } from '../store.ts';
import { t, useLang } from '../i18n.ts';
import type { NewWorldParams } from '@sotv/sim';
import { pushBack } from './App.tsx';
import { APP_STAGE, APP_VERSION } from '../version.ts';
import { platform } from '../platform/index.ts';
import { settings } from '../settings.ts';
import { AUTOSAVE_KEY, writeSave } from '../saves.ts';

export let currentSession: GameSession | null = null;

export function GameScreen({ params, load, exit }: { params?: NewWorldParams; load?: Uint8Array; exit: () => void }) {
  useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session] = useState(() => new GameSession());
  const ready = useStore(session.ready);
  const stats = useStore(session.stats);
  const speed = useStore(session.speed);
  const errors = useStore(session.errors);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    currentSession = session;
    (window as unknown as { __sotv: GameSession }).__sotv = session;
    session.attach(canvasRef.current!);
    if (load) session.load(load);
    else if (params) session.newWorld(params);
    return () => {
      session.dispose();
      currentSession = null;
    };
  }, []);

  const autosave = async () => {
    if (!session.ready.get()) return;
    const bytes = await session.save();
    if (bytes.length === 0) return;
    const st = session.stats.get();
    await writeSave(AUTOSAVE_KEY, bytes, { seed: session.info.seed, size: session.info.size, year: st?.year ?? 0, population: st?.population ?? 0 });
  };

  useEffect(() => {
    const min = Math.max(1, settings.get().autosaveMin);
    const id = setInterval(() => void autosave(), min * 60000);
    platform.onPause(() => void autosave());
    return () => clearInterval(id);
  }, []);

  useEffect(
    () =>
      pushBack(() => {
        setMenu((m) => !m);
        return true;
      }),
    [],
  );

  const leave = async () => {
    await autosave().catch(() => undefined);
    exit();
  };

  return (
    <div class="game" data-testid="game">
      <canvas class="world" ref={canvasRef} data-testid="world-canvas" />
      {ready && (
        <div class="hud-top">
          <button onClick={() => setMenu(true)} data-testid="btn-menu" aria-label="menu">
            ☰
          </button>
          <div class="chip speed">
            {SPEEDS.map((s) => (
              <button key={s} class={speed === s ? 'on' : ''} onClick={() => session.setSpeed(s)} data-testid={'speed-' + s}>
                {s === 0 ? '⏸' : s + '×'}
              </button>
            ))}
          </div>
          <div class="chip" data-testid="hud-stats">
            {stats ? `${stats.tick}` : ''}
          </div>
        </div>
      )}
      {!ready && <div class="overlay-loading">{t('common.loading')}</div>}
      {menu && (
        <div class="modal-back" onClick={() => setMenu(false)}>
          <div class="panel" onClick={(e) => e.stopPropagation()}>
            <h2>{t('app.title')}</h2>
            <p class="muted small">
              v{APP_VERSION} · {t('about.stage')} {APP_STAGE}
            </p>
            <div class="menu-col">
              <button class="primary" onClick={() => setMenu(false)}>
                {t('common.close')}
              </button>
              <button onClick={leave} data-testid="btn-exit">
                {t('menu.exitToMenu')}
              </button>
            </div>
          </div>
        </div>
      )}
      {errors.length > 0 && <div class="err">{errors.slice(-3).join('\n')}</div>}
    </div>
  );
}
