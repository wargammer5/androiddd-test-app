import { it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { strings } from '../src/index.ts';

function files(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

it('every literal translation key used in code exists in both languages', () => {
  const root = path.resolve(__dirname, '../../');
  const used = new Set<string>();
  for (const f of [...files(path.join(root, 'client/src')), ...files(path.join(root, 'sim/src'))]) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]!);
    for (const m of src.matchAll(/text: '([a-zA-Z]+\.[a-zA-Z0-9_.]+)'/g)) used.add(m[1]!);
  }
  const missing = [...used].filter((k) => !k.endsWith('.') && (!strings.ru[k] || !strings.en[k]));
  expect(missing).toEqual([]);
  expect(used.size).toBeGreaterThan(100);
});
