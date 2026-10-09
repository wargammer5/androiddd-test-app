import { useEffect, useState } from 'preact/hooks';
import { t, useLang } from '../i18n.ts';
import { APP_STAGE, APP_VERSION } from '../version.ts';
import type { Screen } from './App.tsx';
import { platform } from '../platform/index.ts';
import { MenuBackground } from './MenuBackground.tsx';
import { listSaves, AUTOSAVE_KEY, readSave } from '../saves.ts';

export function MainMenu({ go }: { go: (s: Screen) => void }) {
  useLang();
  const [hasAuto, setHasAuto] = useState(false);
  useEffect(() => {
    listSaves()
      .then((l) => setHasAuto(l.some((x) => x.key === AUTOSAVE_KEY)))
      .catch(() => setHasAuto(false));
  }, []);
  const cont = async () => {
    const b = await readSave(AUTOSAVE_KEY);
    if (b) go({ id: 'game', load: b });
  };
  const load = async () => {
    const b = await platform.importFile('.sotv,application/octet-stream');
    if (b) go({ id: 'game', load: b });
  };
  return (
    <div class="screen" data-testid="main-menu">
      <MenuBackground />
      <h1 class="title">{t('app.title')}</h1>
      <p class="subtitle">{t('app.subtitle')}</p>
      <div class="menu-col">
        {hasAuto && (
          <button class="primary" onClick={cont} data-testid="btn-continue">
            {t('menu.continue')}
          </button>
        )}
        <button class={hasAuto ? '' : 'primary'} onClick={() => go({ id: 'new' })} data-testid="btn-new">
          {t('menu.new')}
        </button>
        <button onClick={load}>{t('menu.load')}</button>
        <button onClick={() => go({ id: 'settings' })}>{t('menu.settings')}</button>
        <button onClick={() => go({ id: 'about' })} data-testid="btn-about">
          {t('menu.about')}
        </button>
      </div>
      <div class="version-tag" data-testid="version">
        v{APP_VERSION} · {t('about.stage')} {APP_STAGE}
      </div>
    </div>
  );
}
