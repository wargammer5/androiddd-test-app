export const enum PlantType {
  Oak = 0,
  Pine = 1,
  Palm = 2,
  Jungle = 3,
  Cactus = 4,
  Berry = 5,
  Flower = 6,
  Mushroom = 7,
  Crystal = 8,
}
export const PLANT_TYPES = 9;
export const PLANT_STAGES = 6;

export const enum Stage {
  Seed = 0,
  Sprout = 1,
  Young = 2,
  Adult = 3,
  Fruiting = 4,
  Old = 5,
}

export function plantObj(type: number, stage: number): number {
  return 1 + type * PLANT_STAGES + stage;
}

export function isPlant(o: number): boolean {
  return o >= 1 && o <= PLANT_TYPES * PLANT_STAGES;
}

export function plantType(o: number): number {
  return Math.floor((o - 1) / PLANT_STAGES);
}

export function plantStage(o: number): number {
  return (o - 1) % PLANT_STAGES;
}

export function isTree(o: number): boolean {
  if (!isPlant(o)) return false;
  const t = plantType(o);
  return t <= PlantType.Jungle && plantStage(o) >= Stage.Young;
}

export const enum Obj {
  None = 0,
  Stone = 60,
  IronOre = 61,
  GoldOre = 62,
  Gems = 63,
  Cave = 64,
  Mine = 65,
  Spring = 66,
  Vent = 67,
  Ruins = 68,
  Bones = 69,
  FieldEmpty = 70,
  FieldSprout = 71,
  FieldGrowing = 72,
  FieldRipe = 73,
  Stump = 74,
  Burnt = 75,
  Ash = 76,
  Crater = 77,
  Meteor = 78,
  Monolith = 79,
  Tomb = 140,
  Wreck = 141,
  Bridge = 142,
  Beacon = 143,
}

export const BUILDING_BASE = 80;
export const BUILDING_TYPES = 12;
export const RACES = 4;

export const enum Bld {
  Hall = 0,
  House = 1,
  Storage = 2,
  Farm = 3,
  Barracks = 4,
  Temple = 5,
  School = 6,
  Smithy = 7,
  Tower = 8,
  Port = 9,
  Wall = 10,
  Market = 11,
}

export function buildingObj(type: number, race: number): number {
  return BUILDING_BASE + type * RACES + race;
}

export function isBuilding(o: number): boolean {
  return o >= BUILDING_BASE && o < BUILDING_BASE + BUILDING_TYPES * RACES;
}

export function buildingType(o: number): number {
  return Math.floor((o - BUILDING_BASE) / RACES);
}

export function buildingRace(o: number): number {
  return (o - BUILDING_BASE) % RACES;
}

export function isOre(o: number): boolean {
  return o >= Obj.Stone && o <= Obj.Gems;
}

export function blocksMove(o: number): boolean {
  if (isBuilding(o)) {
    const t = buildingType(o);
    return t === Bld.Wall || t === Bld.Tower;
  }
  return o === Obj.Stone || o === Obj.IronOre || o === Obj.GoldOre || o === Obj.Gems || o === Obj.Monolith || o === Obj.Meteor;
}
