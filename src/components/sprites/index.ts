import { spidermanFrames } from './generated/spidermanFrames';
import { VENOM_FACE_PX, venomFrames } from './generated/venomFrames';
import { spidermanCrouch } from './spidermanCrouch';
import { spidermanFront } from './spidermanFront';
import { spidermanSideArt } from './spidermanSideArt';
import { Sprite } from './types';

/**
 * Every sprite in the game, all in one style: flat pixel art with a black
 * outline and dark/mid/light shading, based on the normal-suit side art.
 * Animated frames come from scripts/build_sprites.py.
 */

export type SpidermanPose =
  | 'front'
  | 'crouch'
  | 'idle'
  | 'walk0'
  | 'walk1'
  | 'walk2'
  | 'walk3'
  | 'punch'
  | 'highKick'
  | 'slideKick'
  | 'webShoot'
  | 'jump'
  | 'fight';

export const spiderman: Record<SpidermanPose, Sprite> = {
  ...(spidermanFrames as Record<Exclude<SpidermanPose, 'front' | 'crouch'>, Sprite>),
  crouch: spidermanCrouch, // landing on a rooftop, facing the player
  front: spidermanFront // standing still, facing the player
};

export const WALK_FRAMES: SpidermanPose[] = ['walk0', 'walk1', 'walk2', 'walk3'];

// Jarvis suit: the same frames recolored, red -> charcoal and blue -> gold
const jarvisColors: Record<string, string> = {
  ...spidermanSideArt.colors,
  b: '#1a1a1f',
  c: '#2c2c33',
  d: '#4a4a55',
  f: '#0d0d10',
  g: '#5c4200',
  h: '#c89400',
  i: '#ffd700',
  j: '#8a6400'
};
const recolor = (sprite: Sprite, colors: Record<string, string>): Sprite => ({ ...sprite, colors });

export const jarvis = Object.fromEntries(
  Object.entries(spiderman).map(([pose, sprite]) => [pose, recolor(sprite, jarvisColors)])
) as Record<SpidermanPose, Sprite>;

// Venom (hard level)
export type VenomPose =
  | 'idle0'
  | 'idle1'
  | 'walk0'
  | 'walk1'
  | 'walk2'
  | 'walk3'
  | 'attack0'
  | 'attack1'
  | 'hurt'
  | 'blinded';
export const venom = venomFrames as Record<VenomPose, Sprite>;
/** Venom's face relative to his feet (world units), when facing left. */
export const VENOM_FACE = { x: VENOM_FACE_PX.x * 0.1, y: VENOM_FACE_PX.y * 0.1 };

// Web, drawn after the reference: a strand that fans out at the tip
const webColors = { a: '#1b2a44', g: '#c8d4e8', w: '#ffffff' };
export const webShot: Sprite = {
  colors: webColors,
  faces: 1,
  rows: ['........w..w', '.......g..w.', 'g.g...wwwg..', 'wwwwwwwwwwww', 'g.g...wwwg..', '.......g..w.', '........w..w']
};

// Web stuck over an enemy's face
export const webSplat: Sprite = {
  colors: webColors,
  rows: ['w...w...w', '.g..w..g.', '..wgwgw..', 'wwgwwwgww', '..wgwgw..', '.g..w..g.', 'w...w...w'],
  voxelSize: 0.16
};

// Bat-like wings, out while the suit has enough charge to fly (uses the suit's blue/gold)
const wingHalf = [
  'aa...........',
  'ahaa.........',
  'ahhhaa.......',
  '.ahhhhaaa....',
  '.ahhhhhhhaa..',
  '..ahhahhahha.',
  '..aja.aja.aj.',
  '...a...a...a.'
];
export const wings: Sprite = {
  colors: spidermanSideArt.colors,
  rows: wingHalf.map((row) => row + row.slice(0, -1).split('').reverse().join(''))
};
export const jarvisWings = recolor(wings, jarvisColors);

// Charging pod (glowing capsule)
export const chargingPod: Sprite = {
  colors: { a: '#000000', e: '#9fd8ff', k: '#ffffff' },
  rows: ['.aaaa.', 'akkkka', 'akeeka', 'akkkka', 'akeeka', 'akkkka', '.aaaa.']
};

// Jarvis robot helper (gold, flies next to him in the Jarvis suit)
export const jarvisBot: Sprite = {
  colors: jarvisColors,
  rows: ['.aaaaa.', 'ahiiiha', 'ahkakha', 'ahhhhha', '.aaaaa.', '..a.a..']
};
