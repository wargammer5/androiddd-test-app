import { strings } from '@sotv/content';
import { settings, useStore } from './store-settings.ts';

export function t(key: string, args?: Record<string, string | number>): string {
  const lang = settings.get().lang;
  let s = strings[lang][key] ?? strings.ru[key] ?? key;
  if (args) for (const k in args) s = s.split(`{${k}}`).join(String(args[k]));
  return s;
}

export function useLang(): string {
  return useStore(settings).lang;
}
