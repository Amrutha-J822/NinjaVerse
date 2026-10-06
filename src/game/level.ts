import { art, SURFACE_COLUMN } from './art';

/** World units per image pixel: the art is shown at the same scale it was drawn. */
export const PX = 0.01;

type PieceArt = (typeof art)[
  | 'roofLeft'
  | 'ropeBridge'
  | 'stoneBig'
  | 'plank'
  | 'stoneWide'
  | 'stepBlock'
  | 'swing'
  | 'vineBridge'
  | 'roofRight'];

/**
 * How a piece behaves: drifting back and forth, crumbling and dropping after you land
 * on it, or a false platform that vanishes as you get close.
 */
export type Motion =
  | { kind: 'drift'; axis: 'x' | 'y'; distance: number; period: number }
  | { kind: 'fall' }
  | { kind: 'false' };

export interface Piece {
  id: number;
  art: PieceArt;
  /** What it is, in plain words (used when Ember describes the route). */
  label: string;
  /** World x of the piece's left edge (at rest). */
  x: number;
  /** World y of the piece's bottom edge (at rest). */
  y: number;
  motion?: Motion;
  /** Glowing checkpoint block: falling sends you back to the last one you reached. */
  checkpoint?: boolean;
}

/** Height (world units, from the bottom) of the first spot you can stand on. */
const firstSurface = (a: PieceArt) => (a.surfaces.find((s) => s !== null) ?? 0) * PX;

const labels = new Map<PieceArt, string>([
  [art.roofLeft, 'rooftop'],
  [art.ropeBridge, 'rope bridge'],
  [art.stoneBig, 'floating stone'],
  [art.plank, 'wooden plank'],
  [art.stoneWide, 'floating stone'],
  [art.stepBlock, 'stepping block'],
  [art.swing, 'hanging swing'],
  [art.vineBridge, 'vine bridge'],
  [art.roofRight, 'rooftop']
]);

let nextId = 0;
/** Place a piece so the first spot you can stand on is at height `standY`. */
const place = (a: PieceArt, x: number, standY: number, motion?: Motion, checkpoint = false): Piece => {
  nextId += 1;
  let label = labels.get(a) ?? 'platform';
  if (motion?.kind === 'drift') label = `drifting ${label}`;
  if (motion?.kind === 'fall') label = 'crumbling block';
  if (motion?.kind === 'false') label = 'false platform';
  if (checkpoint) label = 'glowing checkpoint block';
  return { art: a, checkpoint, id: nextId, label, motion, x, y: standY - firstSurface(a) };
};
const checkpointAt = (x: number, standY: number) => place(art.stepBlock, x, standY, undefined, true);

const drift = (axis: 'x' | 'y', distance: number, period: number): Motion => ({
  axis,
  distance,
  kind: 'drift',
  period
});
const falls: Motion = { kind: 'fall' };
const fake: Motion = { kind: 'false' };

/**
 * The level, left to right:
 *  - start rooftop and the broken rope bridge (jump the missing sections)
 *  - floating platforms: a stone drifting left and right, a plank rising and sinking
 *  - crumbling blocks: they shake and crack when you land, then drop, so keep moving
 *  - a glowing checkpoint block and the swing
 *  - a dark stretch where only Ember's light shows the blocks; one of them is false
 *  - another checkpoint, then the vine bridge in a wind that pushes you left
 *  - the far rooftop
 * Single jumps clear about 1.6 units up and 3.6 across; the ninja high jump goes much higher.
 */
export const level: Piece[] = [
  place(art.roofLeft, 0, 0),
  place(art.ropeBridge, 4.3, 0),
  place(art.stoneBig, 15, 0.6),
  // Floating platforms
  place(art.stoneWide, 20, 0.6, drift('x', 4, 5)),
  place(art.plank, 29, 0.6, drift('y', 2.4, 4)),
  // Crumbling blocks
  place(art.stepBlock, 31.5, 3.4, falls),
  place(art.stepBlock, 33, 3.6, falls),
  place(art.stepBlock, 34.5, 3.8, falls),
  checkpointAt(36.3, 4),
  place(art.swing, 37.9, 3.6),
  // Dark stretch, with one false platform
  place(art.stepBlock, 40.6, 3.2),
  place(art.stepBlock, 42.2, 2.6),
  place(art.stepBlock, 43.8, 3, fake),
  place(art.stepBlock, 45.4, 2.8),
  place(art.stepBlock, 47, 3.2),
  checkpointAt(48.6, 3.2),
  // Windy vine bridge and the far rooftop
  place(art.vineBridge, 50, 3),
  place(art.roofRight, 61.5, 2)
];

/** The stretch that is dark until the fireball lights it. */
export const DARK_ZONE = { x0: 40.2, x1: 48.2 };
/** Where the wind blows, and how hard (world units per second; negative pushes left). */
export const WIND_ZONE = { push: -1.6, x0: 49.8, x1: 61.3 };

export const START = { x: 2.5, y: 0 };
export const FINISH_X = 62.2; // reaching the far rooftop
export const LEVEL_WIDTH = 65.2;
export const FALL_LIMIT = -10; // falling below this sends you back to the last checkpoint
export const MAX_STEP = 0.35; // how far up or down he follows a surface while walking

// Burnable vines: a wall of tangled vines across the vine bridge. Ember can burn it
// away (the vines grow back later); a ninja high jump can also get over it.
export const VINE_WALL = { height: 3.4, width: 0.9, x: 55.2 };
const BURN_TIME = 1.4; // seconds of flames before the path is clear
const REGROW_TIME = 14; // seconds until the vines grow back
let burnStartedAt: number | null = null;

/** Ember sets the vines on fire. */
export function burnVines(now: number) {
  burnStartedAt = now;
}

/** Whether the vine wall is standing, burning, or gone, right now. */
export function vineState(now: number) {
  const since = burnStartedAt === null ? null : now - burnStartedAt;
  if (since !== null && since >= REGROW_TIME) burnStartedAt = null;
  if (since === null || since >= REGROW_TIME) return { burning: false, gone: false, solid: true, since };
  return { burning: since < BURN_TIME, gone: since >= BURN_TIME, solid: since < BURN_TIME, since };
}

/** True if this x is inside the windy stretch. */
export const inWind = (x: number) => x >= WIND_ZONE.x0 && x <= WIND_ZONE.x1;

// Crumbling blocks: shake for a moment after you land, drop, then come back.
// False platforms: vanish as soon as you get close, then come back.
const SHAKE_TIME = 0.6;
const VANISH_TIME = 0.3;
export const FALSE_TRIGGER = 1.3; // how close (sideways) the ninja gets before a false platform vanishes
const DROP_TIME = 2;
const RESET_TIME = 4.5;
const DROP_GRAVITY = 25;
const landedAt = new Map<number, number>();

/** Start a crumbling block's countdown (or make a false platform vanish) the first time he triggers it. */
export function touch(piece: Piece, now: number) {
  const kind = piece.motion?.kind;
  if ((kind === 'fall' || kind === 'false') && !landedAt.has(piece.id)) landedAt.set(piece.id, now);
}

/** Seconds since a crumbling block or false platform was triggered (null if it hasn't been). */
export const triggeredFor = (piece: Piece, now: number) =>
  landedAt.has(piece.id) ? now - (landedAt.get(piece.id) as number) : null;

/** Put every crumbling block, false platform and the vines back, for a fresh game. */
export function resetLevel() {
  landedAt.clear();
  burnStartedAt = null;
}

/** Where a piece is right now (offset from its rest position), and whether you can stand on it. */
export function pieceState(piece: Piece, now: number) {
  const { motion } = piece;
  if (motion?.kind === 'drift') {
    const amount = motion.distance * ((1 - Math.cos((2 * Math.PI * now) / motion.period)) / 2);
    return motion.axis === 'x'
      ? { dx: amount, dy: 0, solid: true, visible: true }
      : { dx: 0, dy: amount, solid: true, visible: true };
  }
  if (motion?.kind === 'fall' && landedAt.has(piece.id)) {
    const since = now - (landedAt.get(piece.id) as number);
    if (since < SHAKE_TIME) return { dx: Math.sin(since * 70) * 0.04, dy: 0, solid: true, visible: true };
    const dropping = since - SHAKE_TIME;
    if (dropping < DROP_TIME) return { dx: 0, dy: -0.5 * DROP_GRAVITY * dropping ** 2, solid: false, visible: true };
    if (since < RESET_TIME) return { dx: 0, dy: 0, solid: false, visible: false };
    landedAt.delete(piece.id);
  }
  if (motion?.kind === 'false' && landedAt.has(piece.id)) {
    const since = now - (landedAt.get(piece.id) as number);
    if (since < VANISH_TIME) return { dx: Math.sin(since * 90) * 0.05, dy: 0, solid: false, visible: true };
    if (since < RESET_TIME) return { dx: 0, dy: 0, solid: false, visible: false };
    landedAt.delete(piece.id);
  }
  return { dx: 0, dy: 0, solid: true, visible: true };
}

/**
 * The surface he would stand on at x right now: the highest one that is not above
 * `fromY + MAX_STEP` (so he can step up small bumps but not through platforms).
 */
export function floorBelow(x: number, fromY: number, now: number): { y: number; piece: Piece } | null {
  let best: { y: number; piece: Piece } | null = null;
  level.forEach((piece) => {
    const state = pieceState(piece, now);
    if (!state.solid) return;
    const column = Math.floor((x - piece.x - state.dx) / (SURFACE_COLUMN * PX));
    const surface = piece.art.surfaces[column];
    if (surface === null || surface === undefined) return;
    const y = piece.y + state.dy + surface * PX;
    if (y <= fromY + MAX_STEP && (best === null || y > best.y)) best = { piece, y };
  });
  return best;
}

/** Width of a piece in world units. */
export const widthOf = (piece: Piece) => piece.art.width * PX;

/** Height of a piece's first standing spot right now. */
export function standHeight(piece: Piece, now: number) {
  return piece.y + pieceState(piece, now).dy + firstSurface(piece.art);
}

/** True if this x is inside the dark stretch. */
export const inDark = (x: number) => x >= DARK_ZONE.x0 && x <= DARK_ZONE.x1;

/**
 * The next platform in the direction he is facing: the closest piece that starts
 * (or ends, facing left) beyond where he is, that he isn't already standing on.
 */
export function nextPlatform(
  x: number,
  facing: number,
  now: number,
  standingOn?: Piece,
  skip: (piece: Piece) => boolean = () => false
) {
  let best: { piece: Piece; distance: number } | null = null;
  level.forEach((piece) => {
    if (piece === standingOn || skip(piece) || !pieceState(piece, now).visible) return;
    const left = piece.x + pieceState(piece, now).dx;
    const right = left + widthOf(piece);
    const distance = facing > 0 ? left - x : x - right;
    if (distance > 0 && (best === null || distance < best.distance)) best = { distance, piece };
  });
  return best as { piece: Piece; distance: number } | null;
}

/** Height the vine wall stands on (the vine bridge surface under it). */
export const vineWallBase = () => floorBelow(VINE_WALL.x + VINE_WALL.width / 2, 99, 0)?.y ?? 0;

/** Would moving from x0 to x1 at height y run into the vine wall? */
export function vineWallBlocks(x0: number, x1: number, y: number, now: number) {
  if (!vineState(now).solid) return false;
  const left = VINE_WALL.x;
  const right = VINE_WALL.x + VINE_WALL.width;
  const base = vineWallBase();
  const crossing = (x0 <= left && x1 > left) || (x0 >= right && x1 < right) || (x1 > left && x1 < right);
  return crossing && y < base + VINE_WALL.height && y > base - 1;
}
