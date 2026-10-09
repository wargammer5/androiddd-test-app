import { t, useLang } from '../i18n.ts';
import type { Screen } from './App.tsx';
import { SettingsForm } from './SettingsForm.tsx';

export function SettingsScreen({ go }: { go: (s: Screen) => void }) {
  useLang();
  return (
    <div class="screen" data-testid="settings">
      <div class="panel">
        <h2>{t('menu.settings')}</h2>
        <SettingsForm />
        <button onClick={() => go({ id: 'menu' })}>{t('menu.back')}</button>
      </div>
    </div>
  );
}
