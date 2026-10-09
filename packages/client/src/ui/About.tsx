import { t, useLang } from '../i18n.ts';
import { APP_STAGE, APP_VERSION } from '../version.ts';
import type { Screen } from './App.tsx';
import { CREDITS } from '../credits.ts';

export function About({ go }: { go: (s: Screen) => void }) {
  useLang();
  return (
    <div class="screen" data-testid="about">
      <div class="panel">
        <h2>{t('app.title')}</h2>
        <p>{t('about.text')}</p>
        <p class="muted">
          {t('about.version')}: <b data-testid="about-version">{APP_VERSION}</b> · {t('about.stage')}: <b>{APP_STAGE}</b>
        </p>
        <h3>{t('menu.credits')}</h3>
        <ul class="small">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <b>{c.name}</b> — {c.author} ({c.license})
            </li>
          ))}
        </ul>
        <button onClick={() => go({ id: 'menu' })}>{t('menu.back')}</button>
      </div>
    </div>
  );
}
