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

export const PlantDef = z.object({
  type: z.number().int().min(0),
  key: z.string(),
  biomes: z.array(z.string()),
  density: z.record(z.string(), z.number().min(0).max(1)),
  tempMin: z.number(),
  tempMax: z.number(),
  moistMin: z.number().min(0).max(1),
  growth: z.number().positive(),
  spread: z.number().min(0).max(1),
  life: z.number().int().positive().max(15),
  wood: z.number().min(0),
  food: z.number().min(0),
});
export type PlantDef = z.infer<typeof PlantDef>;

export const Cost = z.record(z.string(), z.number().min(0));
export const EconomyDef = z.object({
  resources: z.array(z.string()),
  foodPerMeal: z.number(),
  spoilagePerDay: z.number().min(0).max(1),
  storageSpoilageFactor: z.number().min(0).max(1),
  winterFuelPerHousePerDay: z.number().min(0),
  toolWearMax: z.number().int().positive(),
  toolBonus: z.number().min(1),
  carryMax: z.number().int().positive(),
  gather: z.record(z.string(), z.number()),
  oreAmount: z.record(z.string(), z.number()),
  smith: z.record(z.string(), Cost),
  eras: z.array(z.object({ key: z.string(), unitBonus: z.number() })),
});
export type EconomyDef = z.infer<typeof EconomyDef>;

export const BuildingDef = z.object({
  type: z.number().int().min(0),
  key: z.string(),
  era: z.number().int().min(0),
  cost: Cost,
  work: z.number().min(0),
  housing: z.number().min(0),
  storage: z.number().min(0),
  max: z.number().int().positive(),
});
export type BuildingDef = z.infer<typeof BuildingDef>;

export const TechDef = z.object({
  key: z.string(),
  era: z.number().int().min(0),
  cost: Cost,
  effect: z.record(z.string(), z.number()),
});
export type TechDef = z.infer<typeof TechDef>;
