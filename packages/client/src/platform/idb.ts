const DB = 'sotvorenie';
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      }),
  );
}

export const idb = {
  async get(key: string): Promise<Uint8Array | null> {
    const v = await tx<unknown>('readonly', (s) => s.get(key));
    if (v instanceof Uint8Array) return v;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    return null;
  },
  async set(key: string, data: Uint8Array): Promise<void> {
    await tx('readwrite', (s) => s.put(data, key));
  },
  async del(key: string): Promise<void> {
    await tx('readwrite', (s) => s.delete(key));
  },
  async keys(prefix: string): Promise<string[]> {
    const all = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    return all.map(String).filter((k) => k.startsWith(prefix));
  },
};
