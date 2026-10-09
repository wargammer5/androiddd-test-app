import { z } from 'zod';

export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const BiomeDef = z.object({
  id: z.number().int().min(0).max(255),
  key: z.string(),
  color,
  fertility: z.number().min(0).max(1),
  moveCost: z.number().min(0),
  tempBias: z.number(),
});
export type BiomeDef = z.infer<typeof BiomeDef>;

export const Strings = z.record(z.string(), z.string());
export type Strings = z.infer<typeof Strings>;

export const SpeciesDef = z.object({
  id: z.number().int().min(0).max(255),
  key: z.string(),
  kind: z.enum(['civ', 'animal', 'monster']),
  race: z.number().int(),
  diet: z.enum(['herb', 'carn', 'omni', 'none']),
  hp: z.number().positive(),
  dmg: z.number().min(0),
  armor: z.number().min(0),
  speed: z.number().positive(),
  vision: z.number().positive(),
  size: z.number().int().min(0).max(3),
  lifespan: z.number().positive(),
  maturity: z.number().min(0),
  litter: z.number().int().min(0),
  fertility: z.number().min(0).max(1),
  biomes: z.array(z.string()),
  colors: z.object({ skin: color, hair: color, cloth: color }),
  traitPool: z.array(z.string()),
  swim: z.boolean(),
  flies: z.boolean().optional(),
});
export type SpeciesDef = z.infer<typeof SpeciesDef>;

export const TraitDef = z.object({
  key: z.string(),
  opposite: z.string(),
  mods: z.record(z.string(), z.number()).optional(),
  ai: z.record(z.string(), z.number()).optional(),
  inherit: z.number().min(0).max(1),
  rare: z.boolean().optional(),
});
export type TraitDef = z.infer<typeof TraitDef>;
