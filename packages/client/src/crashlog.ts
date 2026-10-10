import { APP_STAGE, APP_VERSION } from './version.ts';

const KEY = 'sotv.crashes';

export interface CrashEntry {
  at: number;
  where: string;
  message: string;
  version: string;
}

export function readCrashes(): CrashEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CrashEntry[];
  } catch {
    return [];
  }
}

export function logCrash(where: string, message: string): void {
  try {
    const list = readCrashes();
    list.push({ at: Date.now(), where, message: message.slice(0, 2000), version: `${APP_VERSION}-stage${APP_STAGE}` });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-20)));
  } catch {
    return;
  }
}

export function clearCrashes(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    return;
  }
}

export function crashReport(): string {
  return readCrashes()
    .map((c) => `[${new Date(c.at).toISOString()}] ${c.version} ${c.where}\n${c.message}`)
    .join('\n\n');
}

export function installCrashHandlers(): void {
  window.addEventListener('error', (e) => logCrash('window', `${e.message} @${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => logCrash('promise', String((e.reason as Error)?.stack ?? e.reason)));
  const bridge = (window as unknown as { SotvAndroid?: { lastCrash?: () => string } }).SotvAndroid;
  try {
    const native = bridge?.lastCrash?.();
    if (native) logCrash('android', native);
  } catch {
    return;
  }
}
