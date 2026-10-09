import { t } from '../i18n.ts';
import { useStore } from '../store.ts';
import { settings, patchSettings, type Quality } from '../settings.ts';

export function SettingsForm() {
  const s = useStore(settings);
  return (
    <div>
      <div class="row">
        <label>{t('settings.language')}</label>
        <button class={s.lang === 'ru' ? 'on' : ''} onClick={() => patchSettings({ lang: 'ru' })}>
          Русский
        </button>
        <button class={s.lang === 'en' ? 'on' : ''} onClick={() => patchSettings({ lang: 'en' })}>
          English
        </button>
      </div>
      <div class="row">
        <label>{t('settings.quality')}</label>
        {(['auto', 'low', 'medium', 'high'] as Quality[]).map((q) => (
          <button key={q} class={s.quality === q ? 'on' : ''} onClick={() => patchSettings({ quality: q })}>
            {t('quality.' + q)}
          </button>
        ))}
      </div>
      <div class="row">
        <label>{t('settings.fps')}</label>
        {([30, 60] as const).map((f) => (
          <button key={f} class={s.fpsLimit === f ? 'on' : ''} onClick={() => patchSettings({ fpsLimit: f })}>
            {f}
          </button>
        ))}
      </div>
      <div class="row">
        <label>{t('settings.uiScale')}</label>
        <input class="grow" type="range" min={0.8} max={1.5} step={0.05} value={s.uiScale} onInput={(e) => patchSettings({ uiScale: Number((e.target as HTMLInputElement).value) })} />
        <span>{Math.round(s.uiScale * 100)}%</span>
      </div>
    </div>
  );
}
