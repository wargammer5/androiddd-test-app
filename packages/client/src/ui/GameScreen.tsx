import { useEffect, useRef, useState } from 'preact/hooks';
import { GameSession, SPEEDS } from '../game.ts';
import { useStore } from '../store.ts';
import { t, useLang } from '../i18n.ts';
import type { NewWorldParams, PowerDef } from '@sotv/sim';
import { pushBack } from './App.tsx';
import { platform } from '../platform/index.ts';
import { settings } from '../settings.ts';
import { AUTOSAVE_KEY, writeSave } from '../saves.ts';
import { Toolbar } from './Toolbar.tsx';
import { Minimap } from './Minimap.tsx';
import { Inspector } from './Inspector.tsx';
import { PauseMenu } from './PauseMenu.tsx';
import { Hud } from './Hud.tsx';
import { Confirm } from './Confirm.tsx';
import { extraPanels } from './panels.ts';
import { Layers } from './Layers.tsx';
import { KingdomList } from './KingdomList.tsx';
import { DiplomacyPanel } from './DiplomacyPanel.tsx';
import { BeliefsPanel } from './BeliefsPanel.tsx';
import { registerPanel } from './panels.ts';

registerPanel('kingdoms', KingdomList);
registerPanel('diplomacy', DiplomacyPanel);
registerPanel('beliefs', BeliefsPanel);

export let currentSession: GameSession | null = null;

export function GameScreen({ params, load, exit }: { params?: NewWorldParams; load?: Uint8Array; exit: () => void }) {
  useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session] = useState(() => new GameSession());
  const ready = useStore(session.ready);
  const speed = useStore(session.speed);
  const errors = useStore(session.errors);
  const [menu, setMenu] = useState(false);
  const [mini, setMini] = useState(true);
  const [confirm, setConfirm] = useState<{ text: string; go: () => void } | null>(null);
  const [panel, setPanel] = useState<string | null>(null);

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
        if (session.inspect.get()) {
          session.inspect.set(null);
          return true;
        }
        if (session.tool.get().power) {
          session.tool.set({ ...session.tool.get(), power: null });
          return true;
        }
        setPanel(null);
        setMenu((m) => !m);
        return true;
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault();
        session.setSpeed(session.speed.get() === 0 ? 1 : 0);
      } else if (e.key >= '1' && e.key <= '5' && !e.ctrlKey) session.setSpeed(SPEEDS[Number(e.key) - 1]!);
      else if ((e.key === 'z' || e.key === 'я') && (e.ctrlKey || e.metaKey)) session.cmd({ t: 'undo' });
      else if (e.key === '[' || e.key === 'х') session.tool.update((tl) => ({ ...tl, size: Math.max(0.5, tl.size - 1) }));
      else if (e.key === ']' || e.key === 'ъ') session.tool.update((tl) => ({ ...tl, size: Math.min(30, tl.size + 1) }));
      else if (e.key === 'm' || e.key === 'ь') setMini((v) => !v);
      else if (e.key === 'F11') {
        e.preventDefault();
        void platform.setFullscreen(!platform.isFullscreen());
      } else if (e.key === 'h' || e.key === 'р') session.tool.set({ ...session.tool.get(), power: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const leave = async () => {
    await autosave().catch(() => undefined);
    exit();
  };

  const askConfirm = (p: PowerDef, go: () => void) => setConfirm({ text: t('confirm.power', { name: t('power.' + p.id) }), go });

  const Panel = panel ? extraPanels[panel] : undefined;

  return (
    <div class="game" data-testid="game">
      <canvas class="world" ref={canvasRef} data-testid="world-canvas" />
      {ready && (
        <>
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
            <Hud session={session} onOpen={setPanel} />
            <span class="spacer" />
            <button onClick={() => setPanel((p) => (p === 'kingdoms' ? null : 'kingdoms'))} data-testid="btn-kingdoms" aria-label="kingdoms">
              👑
            </button>
            <button onClick={() => setPanel((p) => (p === 'diplomacy' ? null : 'diplomacy'))} data-testid="btn-diplomacy" aria-label="diplomacy">
              ⚔
            </button>
            <button onClick={() => setPanel((p) => (p === 'beliefs' ? null : 'beliefs'))} data-testid="btn-beliefs" aria-label="beliefs">
              🎭
            </button>
            <Layers session={session} available={[0, 1, 2, 3, 4, 5]} />
            <button onClick={() => setMini((v) => !v)} aria-label="minimap">
              🗺
            </button>
          </div>
          {mini && <Minimap session={session} />}
          {!Panel && <Inspector session={session} />}
          <Toolbar session={session} onConfirm={askConfirm} />
          {Panel && <Panel session={session} onClose={() => setPanel(null)} />}
        </>
      )}
      {!ready && (
        <div class="overlay-loading">
          {errors.length > 0 ? (
            <div class="panel" data-testid="load-error">
              <p>{t('save.corrupt')}</p>
              <p class="muted small">{errors[errors.length - 1]!.split('\n')[0]}</p>
              <button onClick={exit}>{t('menu.back')}</button>
            </div>
          ) : (
            t('common.loading')
          )}
        </div>
      )}
      {menu && (
        <PauseMenu
          session={session}
          onClose={() => setMenu(false)}
          onExit={leave}
          onLoad={(b) => {
            setMenu(false);
            session.load(b);
          }}
        />
      )}
      {confirm && (
        <Confirm
          text={confirm.text}
          onYes={() => {
            confirm.go();
            setConfirm(null);
          }}
          onNo={() => setConfirm(null)}
        />
      )}
      {ready && errors.length > 0 && <div class="err">{errors.slice(-3).join('\n')}</div>}
    </div>
  );
}
