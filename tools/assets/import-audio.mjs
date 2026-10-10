import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/common.mjs';
import { PACKS, MIRRORS, SFX, LOOPS, MUSIC } from './audio-sources.mjs';

const SRC = process.env.SOTV_ASSET_SRC;
if (!SRC || !existsSync(SRC)) {
  console.error('Set SOTV_ASSET_SRC to a folder with "cc0" (clone of ' + MIRRORS.cc0 + ') and "kenney" (clone of ' + MIRRORS.kenney + ').');
  process.exit(2);
}

const OUT = path.join(ROOT, 'packages/client/public/assets/audio');
rmSync(OUT, { recursive: true, force: true });
for (const d of ['sfx', 'loops', 'music']) mkdirSync(path.join(OUT, d), { recursive: true });

const used = new Map();
const src = ([pack, file]) => {
  const p = PACKS[pack];
  const full = path.join(SRC, p.dir, file);
  if (!existsSync(full)) throw new Error('missing source ' + full);
  if (!used.has(pack)) used.set(pack, []);
  used.get(pack).push(file);
  return full;
};

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

function maxVolume(file) {
  const r = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${file}" -af volumedetect -f null - 2>&1`]).toString();
  const m = /max_volume: (-?[\d.]+) dB/.exec(r);
  return m ? Number(m[1]) : 0;
}

const manifest = { sfx: {}, loops: {}, music: {} };

for (const [name, list] of Object.entries(SFX)) {
  manifest.sfx[name] = [];
  list.forEach((entry, i) => {
    const input = src(entry);
    const out = `sfx/${name}_${i}.ogg`;
    const gain = Math.min(24, -1.5 - maxVolume(input));
    ffmpeg(['-i', input, '-af', `silenceremove=start_periods=1:start_threshold=-50dB,volume=${gain.toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '4', path.join(OUT, out)]);
    manifest.sfx[name].push(out);
  });
}

for (const [name, entry] of Object.entries(LOOPS)) {
  const input = src(entry);
  const out = `loops/${name}.ogg`;
  const gain = Math.min(24, -3 - maxVolume(input));
  ffmpeg(['-i', input, '-af', `volume=${gain.toFixed(2)}dB`, '-ac', '2', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '4', path.join(OUT, out)]);
  manifest.loops[name] = out;
}

for (const [mood, list] of Object.entries(MUSIC)) {
  manifest.music[mood] = [];
  list.forEach((entry, i) => {
    const input = src(entry);
    const out = `music/${mood}_${i}.ogg`;
    ffmpeg(['-i', input, '-af', 'loudnorm=I=-20:TP=-2:LRA=11', '-ac', '2', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '3', path.join(OUT, out)]);
    manifest.music[mood].push(out);
  });
}

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

const lines = ['Звуки и музыка: источники и лицензии', '====================================', ''];
for (const [pack, files] of used) {
  const p = PACKS[pack];
  lines.push(`${p.title} — ${p.author} — ${p.license}`);
  lines.push(`  Источник: ${p.url}`);
  lines.push(`  Зеркало: ${MIRRORS[p.dir.split('/')[0]]} (${p.dir.split('/').slice(1).join('/')})`);
  lines.push(`  Файлы: ${[...new Set(files)].join(', ')}`);
  lines.push('');
}
lines.push('CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/');
lines.push('Файлы обработаны: обрезана тишина в начале, выровнена громкость, перекодировано в Ogg Vorbis.');
writeFileSync(path.join(OUT, 'LICENSES.txt'), lines.join('\n') + '\n');
writeFileSync(path.join(ROOT, 'tools/assets/audio-used.json'), JSON.stringify(Object.fromEntries([...used].map(([k, v]) => [k, [...new Set(v)]])), null, 1) + '\n');

let total = 0;
const walk = (d) => {
  for (const f of execFileSync('find', [d, '-type', 'f']).toString().trim().split('\n')) total += statSync(f).size;
};
walk(OUT);
console.log(`audio assets: ${(total / 1048576).toFixed(1)} MB in ${OUT}`);
