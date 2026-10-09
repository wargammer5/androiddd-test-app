import type { DeviceClass } from './types.ts';

export function guessDeviceClass(): DeviceClass {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 4;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (cores <= 4 || mem <= 2) return 'low';
  if (touch && (cores <= 6 || mem <= 4)) return 'mid';
  return touch ? 'mid' : 'high';
}

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function bytesToB64(b: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < b.length; i += step) s += String.fromCharCode(...b.subarray(i, i + step));
  return btoa(s);
}

export function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
