import { useEffect, useState } from 'preact/hooks';

export class Store<T> {
  private listeners = new Set<(v: T) => void>();
  constructor(private value: T) {}
  get(): T {
    return this.value;
  }
  set(v: T): void {
    this.value = v;
    this.listeners.forEach((l) => l(v));
  }
  update(fn: (v: T) => T): void {
    this.set(fn(this.value));
  }
  subscribe(l: (v: T) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export function useStore<T>(s: Store<T>): T {
  const [v, setV] = useState(s.get());
  useEffect(() => {
    setV(s.get());
    return s.subscribe(setV);
  }, [s]);
  return v;
}
