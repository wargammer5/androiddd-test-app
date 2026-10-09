import { platform } from './platform/index.ts';

export const AUTOSAVE_KEY = 'save:auto';
export const SLOT_KEYS = ['save:1', 'save:2', 'save:3'];

export interface SaveMeta {
  key: string;
  seed: string;
  size: string;
  year: number;
  population: number;
  savedAt: number;
  bytes: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function writeSave(key: string, data: Uint8Array, meta: Omit<SaveMeta, 'key' | 'savedAt' | 'bytes'>): Promise<void> {
  await platform.storageSet(key, data);
  const m: SaveMeta = { ...meta, key, savedAt: Date.now(), bytes: data.length };
  await platform.storageSet('meta:' + key, enc.encode(JSON.stringify(m)));
}

export async function readSave(key: string): Promise<Uint8Array | null> {
  return platform.storageGet(key);
}

export async function deleteSave(key: string): Promise<void> {
  await platform.storageDelete(key);
  await platform.storageDelete('meta:' + key);
}

export async function listSaves(): Promise<SaveMeta[]> {
  const keys = await platform.storageKeys('meta:save:');
  const out: SaveMeta[] = [];
  for (const k of keys) {
    const b = await platform.storageGet(k);
    if (!b) continue;
    try {
      out.push(JSON.parse(dec.decode(b)) as SaveMeta);
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}
