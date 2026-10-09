import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREDITS } from '../packages/client/src/credits.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = ['# Авторы и лицензии', '', 'Файл создаётся командой `pnpm credits` из `packages/client/src/credits.ts`.', '', '| Ресурс | Автор | Лицензия | Ссылка |', '|---|---|---|---|'];
for (const c of CREDITS) lines.push(`| ${c.name} | ${c.author} | ${c.license} | ${c.url ?? ''} |`);
lines.push('', 'Свои ассеты можно положить в `packages/client/public/assets/{sprites,sfx,music}`: загрузчик подхватывает их по именам. После этого добавьте запись в `credits.ts`.');
writeFileSync(path.join(root, 'CREDITS.md'), lines.join('\n') + '\n');
console.log('CREDITS.md written');
