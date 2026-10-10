export const PACKS = {
  kenneyInterface: { dir: 'cc0/kenney_interfacesounds/Audio', title: 'Interface Sounds', author: 'Kenney (kenney.nl)', license: 'CC0 1.0', url: 'https://kenney.nl/assets/interface-sounds' },
  kenneyImpact: { dir: 'cc0/kenney_impactsounds/Audio', title: 'Impact Sounds', author: 'Kenney (kenney.nl)', license: 'CC0 1.0', url: 'https://kenney.nl/assets/impact-sounds' },
  kenneyJingles: { dir: 'cc0/kenney_musicjingles/Audio', title: 'Music Jingles', author: 'Kenney (kenney.nl)', license: 'CC0 1.0', url: 'https://kenney.nl/assets/music-jingles' },
  kenneyRpg: { dir: 'kenney/Audio (295 files)/RPG sounds (50 sounds)', title: 'RPG Audio', author: 'Kenney (kenney.nl)', license: 'CC0 1.0', url: 'https://kenney.nl/assets/rpg-audio' },
  sfx100: { dir: 'cc0/100-CC0-SFX', title: '100 CC0 SFX', author: 'rubberduck (OpenGameArt)', license: 'CC0 1.0', url: 'https://opengameart.org/content/100-cc0-sfx' },
  sfx100v2: { dir: 'cc0/100-cc0-sfx-2', title: '100 CC0 SFX #2', author: 'rubberduck (OpenGameArt)', license: 'CC0 1.0', url: 'https://opengameart.org/content/100-cc0-sfx-2' },
  bang: { dir: 'cc0/25-CC0-bang-sfx', title: '25 CC0 bang / firework SFX', author: 'rubberduck (OpenGameArt)', license: 'CC0 1.0', url: 'https://opengameart.org/content/25-cc0-bang-firework-sfx' },
  water: { dir: 'cc0/40-cc0-water-splash-slime-sfx', title: '40 CC0 water / splash / slime SFX', author: 'rubberduck (OpenGameArt)', license: 'CC0 1.0', url: 'https://opengameart.org/content/40-cc0-water-splash-slime-sfx' },
  bfh: { dir: 'cc0/75-cc0-breaking-falling-hit-sfx', title: '75 CC0 breaking / falling / hit SFX', author: 'rubberduck (OpenGameArt)', license: 'CC0 1.0', url: 'https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx' },
  rpg80: { dir: 'cc0/80-CC0-RPG-SFX', title: '80 CC0 RPG SFX', author: 'rubberduck (OpenGameArt)', license: 'CC0 1.0', url: 'https://opengameart.org/content/80-cc0-rpg-sfx' },
  creature80: { dir: 'cc0/80-CC0-creature-SFX', title: '80 CC0 creature SFX', author: 'rubberduck (OpenGameArt)', license: 'CC0 1.0', url: 'https://opengameart.org/content/80-cc0-creature-sfx' },
  stradex: { dir: 'cc0/Maximiliano-Stradex-Ambient', title: 'Ambient music', author: 'Maximiliano Stradex', license: 'CC0 1.0', url: 'https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds/tree/main/Maximiliano-Stradex-Ambient' },
  warfork: { dir: 'cc0/warfork-cc0/music', title: 'Warfork music (fvi)', author: 'Team Forbidden / Warfork', license: 'CC0 1.0', url: 'https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds/tree/main/warfork-cc0' },
};

export const MIRRORS = {
  cc0: 'https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds',
  kenney: 'https://github.com/iwenzhou/kenney',
};

const pad = (n, w) => String(n).padStart(w, '0');
const range = (pack, prefix, from, to, w, ext = '.ogg') => Array.from({ length: to - from + 1 }, (_, i) => [pack, `${prefix}${pad(from + i, w)}${ext}`]);

export const SFX = {
  click: range('kenneyInterface', 'click_', 1, 5, 3),
  ui_open: range('kenneyInterface', 'open_', 1, 4, 3),
  ui_close: range('kenneyInterface', 'close_', 1, 4, 3),
  ui_toggle: range('kenneyInterface', 'toggle_', 1, 4, 3),
  ui_select: range('kenneyInterface', 'select_', 1, 4, 3),
  ui_confirm: range('kenneyInterface', 'confirmation_', 1, 4, 3),
  ui_error: range('kenneyInterface', 'error_', 1, 3, 3),
  ui_back: range('kenneyInterface', 'back_', 1, 4, 3),
  place: range('kenneyInterface', 'drop_', 1, 4, 3),
  explosion: [...range('bang', 'bang_', 1, 6, 2), ['sfx100', 'explosion.ogg'], ...range('bang', 'cannon_', 1, 3, 2)],
  thunder: [['sfx100v2', 'sfx100v2_thunder_01.ogg']],
  splash: range('water', 'splash_', 1, 8, 2),
  fire: range('rpg80', 'spell_fire_', 1, 7, 2),
  clash: [...range('rpg80', 'blade_', 1, 3, 2), ...range('kenneyImpact', 'impactMetal_medium_', 0, 3, 3), ['kenneyRpg', 'knifeSlice.ogg'], ['kenneyRpg', 'knifeSlice2.ogg']],
  death: [['rpg80', 'creature_die_01.ogg'], ...range('creature80', 'hurt_', 1, 5, 2)],
  build: [...range('kenneyImpact', 'impactWood_medium_', 0, 4, 3), ...range('kenneyImpact', 'impactPlank_medium_', 0, 3, 3), ['kenneyRpg', 'chop.ogg']],
  bell: [...range('kenneyImpact', 'impactBell_heavy_', 0, 4, 3), ...range('sfx100', 'bell_', 1, 3, 2)],
  horn: range('sfx100', 'gong_', 1, 2, 2),
  chime: [...range('rpg80', 'spell_', 1, 2, 2), ...range('rpg80', 'item_gem_', 1, 4, 2)],
  whoosh: range('sfx100v2', 'sfx100v2_air_', 1, 3, 2),
  quake: [...range('bfh', 'bfh1_rock_falling_', 1, 5, 2), ...range('bfh', 'bfh1_rock_breaking_', 1, 3, 2)],
  growl: [...range('creature80', 'roar_', 1, 3, 2), ...range('creature80', 'monster_', 1, 5, 2), ...range('rpg80', 'creature_roar_', 1, 3, 2)],
  coin: [...range('rpg80', 'item_coins_', 1, 4, 2), ['kenneyRpg', 'handleCoins.ogg'], ['kenneyRpg', 'handleCoins2.ogg']],
  footstep: range('kenneyImpact', 'footstep_grass_', 0, 4, 3),
  mining: range('kenneyImpact', 'impactMining_', 0, 4, 3),
  jingle_good: range('kenneyJingles', 'Pizzicato jingles/jingles_PIZZI', 0, 5, 2),
  jingle_bad: range('kenneyJingles', 'Hit jingles/jingles_HIT', 0, 5, 2),
  jingle_era: range('kenneyJingles', 'Steel jingles/jingles_STEEL', 0, 3, 2),
};

export const LOOPS = {
  rain: ['water', 'loop_rain.ogg'],
};

export const MUSIC = {
  menu: [['stradex', 'Theme_1.mp3']],
  calm: [['stradex', 'Ambient_2.mp3'], ['warfork', 'fvi-MeditatingBeat.ogg']],
  night: [['stradex', 'Ambient_1.mp3']],
  war: [['warfork', 'fvi-Chronos.ogg'], ['warfork', 'fvi-BeatOne.ogg']],
  disaster: [['warfork', 'fvi-Goodnightmare.ogg']],
};
