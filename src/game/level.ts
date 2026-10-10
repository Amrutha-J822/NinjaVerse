import { art, SURFACE_COLUMN } from './art';
import { LayoutPieceSpec, proposeLayout, lastAttempt, isClearable, placeOrder } from '../utils/levelAI';

/** World units per image pixel: the art is shown at the same scale it was drawn. */
export const PX = 0.01;

/** A platform's picture: its size (image pixels) and the heights you can stand on. */
type PieceArt = { width: number; height: number; originX: number; src: string; surfaces: (number | null)[] };

/** A flame step Ember draws across the last gap (it has no picture; it is drawn as fire). */
const flameStep: PieceArt = { height: 30, originX: 50, src: '', surfaces: Array(10).fill(30), width: 100 };

/**
 * How a piece behaves: drifting back and forth, crumbling and dropping after you land
 * on it, a false platform that vanishes as you get close, or a flame step that is only
 * there once Ember has drawn its flame path.
 */
export type Motion =
  | { kind: 'drift'; axis: 'x' | 'y'; distance: number; period: number }
  | { kind: 'fall' }
  | { kind: 'false' }
  | { kind: 'flame' };

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
  /** Checkpoint (a glowing block or the shrine rooftop): falling sends you back to the last one you reached. */
  checkpoint?: boolean;
  /** The vine-covered bridge: impassable until Ember burns the vines away. */
  overgrown?: boolean;
}

/** Width of a piece in world units. */
export const widthOf = (piece: Piece) => piece.art.width * PX;

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
  [art.vineBeam, 'vine-covered bridge'],
  [art.roofShrine, 'shrine rooftop'],
  [art.roofRight, 'rooftop'],
  [flameStep, 'flame step'],
  [art.lanternRoofDormant, 'highest rooftop']
]);

let nextId = 0;
/** Place a piece so the first spot you can stand on is at height `standY`. */
const place = (a: PieceArt, x: number, standY: number, motion?: Motion, checkpoint = false): Piece => {
  nextId += 1;
  let label = labels.get(a) ?? 'platform';
  if (motion?.kind === 'drift') label = `drifting ${label}`;
  if (motion?.kind === 'fall') label = 'crumbling block';
  if (motion?.kind === 'false') label = 'false platform';
  if (checkpoint) label = a === art.stepBlock ? 'glowing checkpoint block' : `${label} (checkpoint)`;
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
const flame: Motion = { kind: 'flame' };

/**
 * The level, left to right:
 *  - start rooftop and the broken rope bridge (jump the missing sections)
 *  - floating platforms: a stone drifting left and right, a plank rising and sinking
 *  - crumbling blocks: they shake and crack when you land, then drop, so keep moving
 *  - a glowing checkpoint block and the swing
 *  - a dark stretch where only Ember's light shows the blocks; one of them is false
 *  - another checkpoint, then a rooftop and a bridge overgrown with vines: Ember burns them away
 *  - the shrine rooftop (a checkpoint), then the vine bridge in a wind that pushes you left
 *  - a rooftop, then a gap far too wide to jump: Ember draws a path of flame across it
 *    and the ninja hops along the flame steps to the highest rooftop, with its giant lantern
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
  // Burnable vines: rooftop, overgrown bridge (you walk on its beam once the vines burn), shrine rooftop
  place(art.roofLeft, 50.2, 3.2),
  { ...place(art.vineBeam, 54.6, 0), overgrown: true, y: 2.9 - art.vineBeamBurnt.surfaces[0] * PX },
  place(art.roofShrine, 61.3, 3.2, undefined, true),
  // Windy vine bridge and the far rooftop
  place(art.vineBridge, 65.8, 3),
  place(art.roofRight, 77.3, 2),
  // The gap that is too wide to jump, its flame steps, and the highest rooftop (where the journey ends)
  place(flameStep, 82.2, 2.5, flame),
  place(flameStep, 84.2, 3.1, flame),
  place(flameStep, 86.2, 2.6, flame),
  place(flameStep, 88.2, 3.2, flame),
  place(art.lanternRoofDormant, 91, 3.2)
];

/** The stretch that is dark until the fireball lights it. */
export const DARK_ZONE = { x0: 40.2, x1: 48.2 };
/** Where the wind blows, and how hard (world units per second; negative pushes left). */
export const WIND_ZONE = { push: -1.6, x0: 65.6, x1: 77.1 };

export const START = { x: 2.5, y: 0 };
export const FINISH_X = 91.6; // landing on the highest rooftop
export const LEVEL_WIDTH = 98;
export const FALL_LIMIT = -10; // falling below this sends you back to the last checkpoint
export const MAX_STEP = 0.35; // how far up or down he follows a surface while walking

/**
 * The AI-influenced layout: on each page load we ask Nebius for small nudges to the
 * platforms and for a new order of the early sections (the rope bridge, the floating
 * stone, the drifting stone, the rising plank and the crumbling blocks), and apply them
 * only if they pass the jump-budget checks in levelAI. The handcrafted layout above is
 * the fallback. Pieces stay the same objects (same ids), so every derived export keeps
 * working; the anchors stay put because other modules snapshot their positions (START,
 * FLAME_GAP, vineDeck, the ending's lantern), and the dark, vine, wind and flame
 * sections stay pinned to their zones.
 */

/** How far each piece may be nudged [dxMin, dxMax, dyMin, dyMax], in the order of `level`. */
const nudgability: [number, number, number, number][] = [
  [0, 0, 0, 0], // start rooftop: START is fixed
  [-0.5, 0.5, -0.2, 0.2], // rope bridge
  [-0.8, 0.8, -0.4, 0.4], // floating stone
  [-0.5, 0.5, -0.3, 0.3], // drifting stone
  [-0.5, 0.5, -0.3, 0.3], // rising plank
  [-0.3, 0.3, -0.3, 0.3], // crumbling block
  [-0.3, 0.3, -0.3, 0.3], // crumbling block
  [-0.3, 0.3, -0.3, 0.3], // crumbling block
  [-0.3, 0.3, -0.2, 0.2], // glowing checkpoint block
  [-0.3, 0.3, -0.2, 0.2], // swing
  [-0.4, 0.4, -0.3, 0.3], // dark stretch (kept inside DARK_ZONE)
  [-0.4, 0.4, -0.3, 0.3], // dark stretch
  [-0.4, 0.4, -0.3, 0.3], // dark stretch (false platform)
  [-0.4, 0.4, -0.3, 0.3], // dark stretch
  [-0.4, 0.4, -0.3, 0.3], // dark stretch
  [-0.3, 0.3, -0.2, 0.2], // glowing checkpoint block
  [-0.4, 0.4, -0.2, 0.2], // rooftop before the vines
  [-0.4, 0.4, 0, 0], // overgrown bridge: vineDeck is measured once, so it may only slide
  [-0.3, 0.3, -0.2, 0.2], // shrine rooftop (checkpoint)
  [-0.2, 0.4, -0.3, 0.3], // vine bridge (kept inside WIND_ZONE)
  [0, 0, 0, 0], // rooftop whose edge is FLAME_GAP.x0 and height is FLAME_GAP.y
  [-0.25, 0.25, -0.4, 0.4], // flame step (kept inside the flame gap)
  [-0.25, 0.25, -0.4, 0.4], // flame step
  [-0.25, 0.25, -0.4, 0.4], // flame step
  [-0.25, 0.25, -0.4, 0.4], // flame step
  [0, 0, 0, 0] // highest rooftop: the ending lights its lantern at a fixed spot
];

/** Indices of the sections the AI may put in a different order: everything between the start rooftop and the first checkpoint. */
const shuffleable = [1, 2, 3, 4, 5, 6, 7];

/** The walkable span of a piece's top and the height you stand on, at rest. */
const walkOf = (piece: Piece) => {
  let { surfaces } = piece.art;
  if (piece.overgrown) surfaces = art.vineBeamBurnt.surfaces; // you walk on the beam once the vines burn
  let first: number | null = null;
  let last: number | null = null;
  surfaces.forEach((s, i) => {
    if (s !== null) {
      if (first === null) first = i;
      last = i;
    }
  });
  if (first === null || last === null) return null;
  return {
    walkLeft: piece.x + first * SURFACE_COLUMN * PX,
    walkRight: piece.x + (last + 1) * SURFACE_COLUMN * PX,
    standY: piece.y + (surfaces.find((s) => s !== null) ?? 0) * PX
  };
};

const specs: LayoutPieceSpec[] = level.map((piece, i) => {
  const [dxMin, dxMax, dyMin, dyMax] = nudgability[i];
  const walk = walkOf(piece) ?? {
    walkLeft: piece.x,
    walkRight: piece.x + widthOf(piece),
    standY: standHeight(piece, 0)
  };
  const distance = piece.motion?.kind === 'drift' ? piece.motion.distance : 0;
  return {
    id: String(piece.id),
    label: piece.label,
    x: piece.x,
    y: piece.y,
    walkLeft: walk.walkLeft,
    walkRight: walk.walkRight,
    standY: walk.standY,
    dxMin,
    dxMax,
    dyMin,
    dyMax,
    driftX: piece.motion?.kind === 'drift' && piece.motion.axis === 'x' ? distance : 0,
    driftY: piece.motion?.kind === 'drift' && piece.motion.axis === 'y' ? distance : 0,
    walkable: piece.motion?.kind !== 'false',
    reorderable: shuffleable.includes(i)
  };
});

/** What actually happened for this page load: 'ai' means the AI layout was applied. */
export const layoutSource = { state: 'pending' };

/**
 * The layout for this page load: ask the AI, and move the pieces in place only if the
 * proposal checks out. Await this before a journey starts (the handcrafted layout is
 * already in place, so on any failure we simply never move anything).
 */
const layoutReady = (async () => {
  const proposal = await proposeLayout(specs);
  if (proposal === null) {
    layoutSource.state = 'fallback';
    console.info(`[levelAI] kept the handcrafted layout: ${lastAttempt.reason} (${lastAttempt.ms}ms, http ${lastAttempt.httpStatus})`);
    return;
  }
  let at = new Map<string, { x: number; y: number }>();
  specs.forEach((s) => {
    const n = proposal.nudges.get(s.id) ?? { dx: 0, dy: 0 };
    at.set(s.id, { x: s.x + n.dx, y: s.y + n.dy });
  });
  let shuffled = false;
  if (proposal.order !== null) {
    const placed = placeOrder(specs, proposal.order);
    if (placed !== null) {
      const shuffledAt = new Map(at);
      placed.forEach((x, id) => {
        const s = specs.find((q) => q.id === id) as LayoutPieceSpec;
        const n = proposal.nudges.get(id) ?? { dx: 0, dy: 0 };
        shuffledAt.set(id, { x: x + n.dx, y: s.y + n.dy });
      });
      if (isClearable(specs, shuffledAt)) {
        at = shuffledAt;
        shuffled = true;
      } else {
        console.info('[levelAI] dropped the proposed order: it asked for a jump the ninja cannot make');
      }
    }
  }
  if (!isClearable(specs, at)) {
    layoutSource.state = 'fallback';
    console.info('[levelAI] kept the handcrafted layout: the proposal asked for a jump the ninja cannot make');
    return;
  }
  layoutSource.state = 'ai';
  console.info(`[levelAI] applied the AI layout (${shuffled ? 'shuffled and nudged' : 'nudged'} layout, ${lastAttempt.ms}ms)`);
  level.forEach((piece) => {
    const p = at.get(String(piece.id));
    if (p) {
      piece.x = p.x;
      piece.y = p.y;
    }
  });
})();

/** Wait until the layout has been decided (nudges applied, or the fallback kept). */
export const awaitLayout = () => layoutReady;

// Burnable vines: they cover the overgrown bridge until Ember burns them away (they stay burnt)
export const VINE_BURN_TIME = 2.2; // seconds for the fire to sweep across the bridge
let burnStartedAt: number | null = null;

/** Ember sets the vines on fire. */
export function burnVines(now: number) {
  if (burnStartedAt === null) burnStartedAt = now;
}

/**
 * Whether the vines are still there, burning, or gone. `front` is how far the fire has
 * swept across the bridge (0 = near end, 1 = far end).
 */
export function vineState(now: number) {
  const since = burnStartedAt === null ? null : now - burnStartedAt;
  const front = since === null ? 0 : Math.min(1, since / VINE_BURN_TIME);
  return {
    burning: since !== null && since < VINE_BURN_TIME,
    front,
    gone: since !== null && since >= VINE_BURN_TIME,
    since
  };
}

// The flame path: Ember flies across the wide gap drawing it, and each flame step can be
// stood on once the flame has reached it (the path stays lit after that)
export const FLAME_GAP = { x0: 80.85, x1: 91, y: 2 }; // from the rooftop's edge to the last building
export const FLAME_DRAW_TIME = 2.4; // seconds for Ember to draw the path across
let flameStartedAt: number | null = null;

/** Ember starts drawing the flame path. */
export function drawFlamePath(now: number) {
  if (flameStartedAt === null) flameStartedAt = now;
}

/** Whether the flame path has been started, is still being drawn, and how far across it reaches. */
export function flamePathState(now: number) {
  const since = flameStartedAt === null ? null : now - flameStartedAt;
  const done = since === null ? 0 : Math.min(1, since / FLAME_DRAW_TIME);
  return {
    drawing: since !== null && since < FLAME_DRAW_TIME,
    head: FLAME_GAP.x0 + done * (FLAME_GAP.x1 - FLAME_GAP.x0),
    started: since !== null
  };
}

/** True if this x is inside the windy stretch. */
export const inWind = (x: number) => x >= WIND_ZONE.x0 && x <= WIND_ZONE.x1;

// Crumbling blocks: shake for a moment after you land, drop, then come back.
// False platforms: vanish as soon as you get close, then come back.
export const SHAKE_TIME = 0.6;
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
  flameStartedAt = null;
}

/** Where a piece is right now (offset from its rest position), and whether you can stand on it. */
export function pieceState(piece: Piece, now: number) {
  const { motion } = piece;
  if (motion?.kind === 'flame') {
    const lit = flamePathState(now).head >= piece.x + widthOf(piece);
    return { dx: 0, dy: 0, solid: lit, visible: lit };
  }
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
    // Behind the burning front (or once the vines are gone) you can walk on the overgrown bridge's beam
    let { surfaces } = piece.art;
    if (piece.overgrown && x < piece.x + vineState(now).front * widthOf(piece) - 0.3)
      surfaces = art.vineBeamBurnt.surfaces;
    const surface = surfaces[column];
    if (surface === null || surface === undefined) return;
    const y = piece.y + state.dy + surface * PX;
    if (y <= fromY + MAX_STEP && (best === null || y > best.y)) best = { piece, y };
  });
  return best;
}

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

/** The highest rooftop, with the giant lantern Ember lights at the end. */
export const highestRoof = level[level.length - 1];

/** The flame steps across the wide gap. */
export const flameSteps = level.filter((p) => p.motion?.kind === 'flame');

/**
 * Height of the flame path at x: it runs from the rooftop's edge through the top of each
 * flame step to the last building, in smooth waves.
 */
export function flamePathY(x: number) {
  const knots = [
    [FLAME_GAP.x0, FLAME_GAP.y],
    ...flameSteps.map((p) => [p.x + widthOf(p) / 2, standHeight(p, 0)]),
    [FLAME_GAP.x1, standHeight(level[level.length - 1], 0)]
  ];
  const i = knots.findIndex(([kx]) => kx > x);
  if (i <= 0) return knots[i === 0 ? 0 : knots.length - 1][1];
  const [ax, ay] = knots[i - 1];
  const [bx, by] = knots[i];
  const f = (1 - Math.cos(((x - ax) / (bx - ax)) * Math.PI)) / 2;
  return ay + (by - ay) * f;
}

/** The overgrown bridge and the height of its beam. */
export const vineBridge = level.find((p) => p.overgrown) as Piece;
export const vineDeck = vineBridge.y + (art.vineBeamBurnt.surfaces[0] ?? 0) * PX;

/** World x of the burning front right now. */
export const burnFrontX = (now: number) => vineBridge.x + vineState(now).front * widthOf(vineBridge);

/** Would moving from x0 to x1 at height y take him into the vines that are still there? */
export function vinesBlock(x0: number, x1: number, y: number, now: number) {
  const state = vineState(now);
  if (state.gone) return false;
  const left = state.burning ? burnFrontX(now) - 0.3 : vineBridge.x; // the fire clears the way as it goes
  const right = vineBridge.x + widthOf(vineBridge);
  const entering = (x0 <= left && x1 > left) || (x0 >= right && x1 < right);
  return entering && y > vineDeck - 1.5 && y < vineDeck + 6;
}
