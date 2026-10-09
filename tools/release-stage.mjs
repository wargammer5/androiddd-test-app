import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, run, version, apkName } from './lib/common.mjs';

const v = version();
const skipSmoke = process.argv.includes('--skip-smoke');
const log = [];
const step = (name, fn) => {
  console.log(`\n=== ${name} ===`);
  fn();
  log.push(name + ': ok');
};
step('tests', () => run('pnpm', ['test']));
step('content', () => run('pnpm', ['validate:content']));
step('bench', () => run('pnpm', ['bench']));
step('web build', () => run('pnpm', ['build:web']));
if (!skipSmoke) step('smoke', () => run('pnpm', ['smoke']));
step('apk', () => run('node', ['tools/android/build-apk.mjs', '--skip-web']));
step('verify', () => run('node', ['tools/android/verify-apk.mjs']));

const dist = path.join(ROOT, 'dist', `stage-${v.stage}`);
mkdirSync(dist, { recursive: true });
const apk = path.join(ROOT, 'out', apkName(v));
copyFileSync(apk, path.join(dist, apkName(v)));
const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.txt'), 'utf8');
writeFileSync(path.join(dist, 'CHANGELOG.txt'), changelog);
const bench = existsSync(path.join(ROOT, 'tools/bench/last.json')) ? readFileSync(path.join(ROOT, 'tools/bench/last.json'), 'utf8') : '{}';
writeFileSync(path.join(dist, 'BUILD-REPORT.txt'), [`Sotvorenie v${v.version} stage ${v.stage}`, `APK ${apkName(v)} ${(statSync(apk).size / 1048576).toFixed(2)} MB`, ...log, 'bench: ' + bench.replace(/\s+/g, ' ')].join('\n') + '\n');
console.log(`\nStage ${v.stage} artifacts in ${dist}`);
