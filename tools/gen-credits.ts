import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREDITS } from '../packages/client/src/credits.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = ['# Авторы и лицензии', '', 'Файл создаётся командой `pnpm credits` из `packages/client/src/credits.ts`.', '', '| Ресурс | Автор | Лицензия | Ссылка |', '|---|---|---|---|'];
for (const c of CREDITS) lines.push(`| ${c.name} | ${c.author} | ${c.license} | ${c.url ?? ''} |`);
lines.push('', 'Пофайловый список звуков с источниками: `packages/client/public/assets/audio/LICENSES.txt`. Спрайты меню: `packages/client/public/assets/sprites/LICENSES.txt`.', '', 'Звуки пересобираются скриптом `tools/assets/import-audio.mjs` из зеркал на GitHub: https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds и https://github.com/iwenzhou/kenney. Свой звук можно подключить, положив .ogg в `packages/client/public/assets/audio/` и прописав путь в `manifest.json`.');
writeFileSync(path.join(root, 'CREDITS.md'), lines.join('\n') + '\n');
console.log('CREDITS.md written');
