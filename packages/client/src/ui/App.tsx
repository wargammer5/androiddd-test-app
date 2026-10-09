import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../store.ts';
import { settings } from '../settings.ts';
import { platform } from '../platform/index.ts';
import { MainMenu } from './MainMenu.tsx';
import { NewWorld } from './NewWorld.tsx';
import { About } from './About.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { GameScreen } from './GameScreen.tsx';
import type { NewWorldParams } from '@sotv/sim';

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
