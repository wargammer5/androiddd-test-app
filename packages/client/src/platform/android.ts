import type { Platform, DeviceClass } from './types.ts';
import { idb } from './idb.ts';
import { b64ToBytes, bytesToB64, guessDeviceClass } from './common.ts';

interface Bridge {
  exportFile(name: string, b64: string, mime: string, cbId: number): void;
  importFile(accept: string, cbId: number): void;
  share(title: string, text: string): void;
  vibrate(ms: number): void;
  setImmersive(on: boolean): void;
  exitApp(): void;
  deviceInfo(): string;
  insetsJson(): string;
}

type Cb = (ok: boolean, data?: string) => void;

declare global {
  interface Window {
    SotvAndroid?: Bridge;
    __sotvBack?: () => boolean;
    __sotvLifecycle?: (state: string) => void;
    __sotvCallback?: (id: number, ok: boolean, data?: string) => void;
  }
}

export function hasAndroidBridge(): boolean {
  return typeof window.SotvAndroid !== 'undefined';
}

export function createAndroidPlatform(): Platform {
  const bridge = window.SotvAndroid!;
  const backHandlers: (() => boolean)[] = [];
  const pauseHandlers: (() => void)[] = [];
  const resumeHandlers: (() => void)[] = [];
  const callbacks = new Map<number, Cb>();
  let nextId = 1;
  let immersive = true;
  window.__sotvCallback = (id, ok, data) => {
    const cb = callbacks.get(id);
    callbacks.delete(id);
    cb?.(ok, data);
  };
  window.__sotvBack = () => {
    for (let i = backHandlers.length - 1; i >= 0; i--) if (backHandlers[i]!()) return true;
    return false;
  };
  window.__sotvLifecycle = (state) => {
    if (state === 'pause') pauseHandlers.forEach((h) => h());
    if (state === 'resume') resumeHandlers.forEach((h) => h());
  };
  let info: { memMb?: number; cores?: number; sdk?: number; safe?: number[] } = {};
  try {
    info = JSON.parse(bridge.deviceInfo()) as typeof info;
  } catch {
    info = {};
  }
  const applySafe = (safe?: number[]) => {
    if (!safe || safe.length !== 4) return;
    const st = document.documentElement.style;
    st.setProperty('--safe-t', `max(env(safe-area-inset-top, 0px), ${safe[0]}px)`);
    st.setProperty('--safe-r', `max(env(safe-area-inset-right, 0px), ${safe[1]}px)`);
    st.setProperty('--safe-b', `max(env(safe-area-inset-bottom, 0px), ${safe[2]}px)`);
    st.setProperty('--safe-l', `max(env(safe-area-inset-left, 0px), ${safe[3]}px)`);
  };
  applySafe(info.safe);
  const refreshSafe = () => {
    try {
      applySafe(JSON.parse(bridge.insetsJson()) as number[]);
    } catch {
      return;
    }
  };
  window.addEventListener('resize', () => setTimeout(refreshSafe, 200));
  setTimeout(refreshSafe, 500);
  const call = (fn: (id: number) => void) =>
    new Promise<{ ok: boolean; data?: string }>((res) => {
      const id = nextId++;
      callbacks.set(id, (ok, data) => res({ ok, data }));
      fn(id);
    });
  return {
    name: 'android',
    storageGet: (k) => idb.get(k),
    storageSet: (k, d) => idb.set(k, d),
    storageDelete: (k) => idb.del(k),
    storageKeys: (p) => idb.keys(p),
    async exportFile(name, data, mime) {
      const r = await call((id) => bridge.exportFile(name, bytesToB64(data), mime, id));
      return r.ok;
    },
    async importFile(accept) {
      const r = await call((id) => bridge.importFile(accept, id));
      return r.ok && r.data ? b64ToBytes(r.data) : null;
    },
    async share(title, text) {
      bridge.share(title, text);
      return true;
    },
    async setFullscreen(on) {
      immersive = on;
      bridge.setImmersive(on);
    },
    isFullscreen: () => immersive,
    vibrate: (ms) => bridge.vibrate(ms),
    onBack: (h) => void backHandlers.push(h),
    onPause: (h) => void pauseHandlers.push(h),
    onResume: (h) => void resumeHandlers.push(h),
    deviceClass(): DeviceClass {
      const mem = info.memMb ?? 0;
      const cores = info.cores ?? 0;
      if (!mem) return guessDeviceClass();
      if (mem < 3500 || cores <= 4) return 'low';
      if (mem < 7000) return 'mid';
      return 'high';
    },
    isTouch: () => true,
    exitApp: () => bridge.exitApp(),
  };
}
