import type { Platform } from './types.ts';
import { idb } from './idb.ts';
import { guessDeviceClass, isTouchDevice } from './common.ts';

export function createWebPlatform(): Platform {
  const backHandlers: (() => boolean)[] = [];
  const pauseHandlers: (() => void)[] = [];
  const resumeHandlers: (() => void)[] = [];
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseHandlers.forEach((h) => h());
    else resumeHandlers.forEach((h) => h());
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      for (let i = backHandlers.length - 1; i >= 0; i--) if (backHandlers[i]!()) return;
    }
  });
  return {
    name: 'web',
    storageGet: (k) => idb.get(k),
    storageSet: (k, d) => idb.set(k, d),
    storageDelete: (k) => idb.del(k),
    storageKeys: (p) => idb.keys(p),
    async exportFile(name, data, mime) {
      const blob = new Blob([data as BlobPart], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return true;
    },
    importFile(accept) {
      return new Promise((res) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = async () => {
          const f = input.files?.[0];
          res(f ? new Uint8Array(await f.arrayBuffer()) : null);
        };
        input.click();
      });
    },
    async share(title, text) {
      const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
      if (nav.share) {
        try {
          await nav.share({ title, text });
          return true;
        } catch {
          return false;
        }
      }
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    async setFullscreen(on) {
      try {
        if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
        if (!on && document.fullscreenElement) await document.exitFullscreen();
      } catch {
        return;
      }
    },
    isFullscreen: () => !!document.fullscreenElement,
    vibrate(ms) {
      navigator.vibrate?.(ms);
    },
    onBack: (h) => void backHandlers.push(h),
    onPause: (h) => void pauseHandlers.push(h),
    onResume: (h) => void resumeHandlers.push(h),
    deviceClass: guessDeviceClass,
    isTouch: isTouchDevice,
    exitApp() {
      window.close();
    },
  };
}
