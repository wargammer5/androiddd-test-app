import { z } from 'zod';
import { BiomeDef, Strings } from './schemas.ts';
import biomesJson from '../data/biomes.json';
import ruJson from '../data/i18n/ru.json';
import enJson from '../data/i18n/en.json';

export * from './schemas.ts';

function parse<T>(name: string, schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new Error(`content ${name}: ${r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  return r.data;
}

export const biomes = parse('biomes', z.array(BiomeDef), biomesJson);
export const strings = {
  ru: parse('i18n/ru', Strings, ruJson),
  en: parse('i18n/en', Strings, enJson),
};
export type Lang = keyof typeof strings;

export function validateAll(): string[] {
  const errors: string[] = [];
  const ruKeys = new Set(Object.keys(strings.ru));
  const enKeys = new Set(Object.keys(strings.en));
  for (const k of ruKeys) if (!enKeys.has(k)) errors.push(`en missing ${k}`);
  for (const k of enKeys) if (!ruKeys.has(k)) errors.push(`ru missing ${k}`);
  biomes.forEach((b, i) => {
    if (b.id !== i) errors.push(`biome ${b.key} id ${b.id} != index ${i}`);
    if (!strings.ru[`biome.${b.key}`]) errors.push(`ru missing biome.${b.key}`);
  });
  return errors;
}
