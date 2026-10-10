import { t } from '../i18n.ts';
import { useStore } from '../store.ts';
import { settings, patchSettings, type Quality, type Settings } from '../settings.ts';
import { currentSession } from './GameScreen.tsx';
import { platform } from '../platform/index.ts';

export function SettingsForm(_p: { inGame?: boolean }) {
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
        <label>{t('settings.ecosystem')}</label>
        {(['off', 'slow', 'normal', 'fast'] as Settings['ecosystem'][]).map((k) => (
          <button
            key={k}
            class={s.ecosystem === k ? 'on' : ''}
            onClick={() => {
              patchSettings({ ecosystem: k });
              currentSession?.cmd({ t: 'law', key: 'ecosystem', value: k });
            }}
          >
            {t('eco.' + k)}
          </button>
        ))}
      </div>
      {(['clouds', 'bloom', 'vibration', 'batterySaver'] as const).map((k) => (
        <div class="row" key={k}>
          <label>{t('settings.' + k)}</label>
          <button class={s[k] ? 'on' : ''} onClick={() => patchSettings({ [k]: !s[k] } as Partial<Settings>)} data-testid={'set-' + k}>
            {s[k] ? t('common.on') : t('common.off')}
          </button>
        </div>
      ))}
      <div class="row">
        <label>{t('settings.autosave')}</label>
        {[1, 3, 5, 10].map((m) => (
          <button key={m} class={s.autosaveMin === m ? 'on' : ''} onClick={() => patchSettings({ autosaveMin: m })} style={{ minWidth: '44px' }}>
            {m}
          </button>
        ))}
        <span class="small muted">{t('settings.minutes')}</span>
      </div>
      <div class="row">
        <label>{t('settings.fullscreen')}</label>
        <button onClick={() => void platform.setFullscreen(!platform.isFullscreen())}>⛶</button>
      </div>
      <div class="row">
        <label>{t('settings.uiScale')}</label>
        <input class="grow" type="range" min={0.8} max={1.5} step={0.05} value={s.uiScale} onInput={(e) => patchSettings({ uiScale: Number((e.target as HTMLInputElement).value) })} />
        <span>{Math.round(s.uiScale * 100)}%</span>
      </div>
    </div>
  );
}
