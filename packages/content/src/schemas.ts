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
