import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../store.ts';
import { settings } from '../settings.ts';
import { platform } from '../platform/index.ts';
import { MainMenu } from './MainMenu.tsx';
import { NewWorld } from './NewWorld.tsx';
import { About } from './About.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { GameScreen } from './GameScreen.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import type { NewWorldParams } from '@sotv/sim';
import { audio, type SoundName } from '../audio/engine.ts';

const unlock = () => {
  audio.unlock();
  audio.setMood('menu');
};
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });
window.addEventListener(
  'click',
  (e) => {
    const b = (e.target as HTMLElement)?.closest?.('button');
    if (!b) return;
    const label = (b.textContent ?? '').trim();
    if (b.dataset.sfx) audio.play(b.dataset.sfx as SoundName, { volume: 0.45, throttleMs: 30 });
    else if (b.closest('.menu-col')) audio.play('ui_select', { volume: 0.45, throttleMs: 30 });
    else if (b.dataset.testid === 'btn-create') audio.play('ui_confirm', { volume: 0.5, throttleMs: 30 });
    else if (label === '✕') audio.play('ui_close', { volume: 0.4, throttleMs: 30 });
    else if (b.closest('.settings, .row')) audio.play('ui_toggle', { volume: 0.4, throttleMs: 30 });
    else audio.play('click', { volume: 0.35, throttleMs: 30 });
  },
  { capture: true },
);
platform.onPause(() => audio.suspend());
platform.onResume(() => audio.resume());

export type Screen =
  | { id: 'menu' }
  | { id: 'new' }
  | { id: 'about' }
  | { id: 'settings' }
  | { id: 'game'; params?: NewWorldParams; load?: Uint8Array };

const backStack: (() => boolean)[] = [];
export function pushBack(h: () => boolean): () => void {
  backStack.push(h);
  return () => {
    const i = backStack.lastIndexOf(h);
    if (i >= 0) backStack.splice(i, 1);
  };
}
platform.onBack(() => {
  for (let i = backStack.length - 1; i >= 0; i--) if (backStack[i]!()) return true;
  return false;
});

export function App() {
  const s = useStore(settings);
  const [screen, setScreen] = useState<Screen>({ id: 'menu' });
  useEffect(() => {
    document.documentElement.style.setProperty('--ui', String(s.uiScale));
    document.documentElement.lang = s.lang;
  }, [s.uiScale, s.lang]);
  useEffect(() => {
    if (screen.id === 'menu' || screen.id === 'game') return;
    return pushBack(() => {
      setScreen({ id: 'menu' });
      return true;
    });
  }, [screen.id]);
  const go = (sc: Screen) => setScreen(sc);
  return <ErrorBoundary onReset={() => setScreen({ id: 'menu' })}>{renderScreen(screen, go)}</ErrorBoundary>;
}

function renderScreen(screen: Screen, go: (s: Screen) => void) {
  switch (screen.id) {
    case 'menu':
      return <MainMenu go={go} />;
    case 'new':
      return <NewWorld go={go} />;
    case 'about':
      return <About go={go} />;
    case 'settings':
      return <SettingsScreen go={go} />;
    case 'game':
      return <GameScreen key={String(Date.now())} params={screen.params} load={screen.load} exit={() => go({ id: 'menu' })} />;
  }
}
