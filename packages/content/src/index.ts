import { z } from 'zod';
import { BiomeDef, Strings, SpeciesDef, TraitDef, PlantDef } from './schemas.ts';
import plantsJson from '../data/plants.json';
import speciesJson from '../data/species.json';
import traitsJson from '../data/traits.json';
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
export const species = parse('species', z.array(SpeciesDef), speciesJson);
export const traits = parse('traits', z.array(TraitDef), traitsJson);
export const plants = parse('plants', z.array(PlantDef), plantsJson);
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
  const biomeKeys = new Set(biomes.map((b) => b.key));
  const traitKeys = new Set(traits.map((t) => t.key));
  species.forEach((sp, i) => {
    if (sp.id !== i) errors.push(`species ${sp.key} id ${sp.id} != index ${i}`);
    for (const b of sp.biomes) if (!biomeKeys.has(b)) errors.push(`species ${sp.key} unknown biome ${b}`);
    for (const t of sp.traitPool) if (!traitKeys.has(t)) errors.push(`species ${sp.key} unknown trait ${t}`);
    if (!strings.ru[`species.${sp.key}`]) errors.push(`ru missing species.${sp.key}`);
  });
  plants.forEach((p, i) => {
    if (p.type !== i) errors.push(`plant ${p.key} type ${p.type} != index ${i}`);
    for (const b of [...p.biomes, ...Object.keys(p.density)]) if (!biomeKeys.has(b)) errors.push(`plant ${p.key} unknown biome ${b}`);
    if (!strings.ru[`plant.${p.key}`]) errors.push(`ru missing plant.${p.key}`);
  });
  for (const t of traits) {
    if (t.opposite && !traitKeys.has(t.opposite)) errors.push(`trait ${t.key} unknown opposite ${t.opposite}`);
    if (!strings.ru[`trait.${t.key}`]) errors.push(`ru missing trait.${t.key}`);
  }
  return errors;
}
