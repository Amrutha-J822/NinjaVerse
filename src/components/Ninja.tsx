import React, { useEffect, useRef, useState } from 'react';
import { Group } from 'three';

import { Html, useKeyboardControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

import { art } from '../game/art';
import { endingTime, lineFor, STAND_X, T } from '../game/ending';
import {
  FALL_LIMIT,
  FALSE_TRIGGER,
  floorBelow,
  inWind,
  level,
  LEVEL_WIDTH,
  MAX_STEP,
  Piece,
  pieceState,
  standHeight,
  START,
  touch,
  vinesBlock,
  widthOf,
  WIND_ZONE
} from '../game/level';
import { play, playAny } from '../game/sound';
import { world } from '../game/world';

import { GameSprite } from './GameSprite';

type Pose = 'ready' | 'run' | 'leap' | 'rise' | 'fall';

const poses = {
  fall: art.ninjaFall, // coming down
  leap: art.ninjaLeap, // long stride: second run frame, and a normal jump going up
  ready: art.ninjaReady, // standing, and landing
  rise: art.ninjaRise, // ninja high jump going up
  run: art.ninjaRun
};
const RUN_CYCLE: Pose[] = ['run', 'leap'];

const RUN_SPEED = 4.5;
const GRAVITY = 20;
const JUMP_SPEED = 8; // single Up arrow: normal jump
const NINJA_JUMP_SPEED = 11; // Up arrow again in the air: ninja high jump
const RUN_FPS = 8;
const LEVEL_END = LEVEL_WIDTH - 0.6; // he can't run past the end of the last building

const WOODEN = [art.plank, art.ropeBridge, art.swing, art.vineBridge, art.vineBeam];

/** Landing: a thud on stone or wood, louder the harder he lands, or a puff of fire on a flame step. */
function landSound(piece: Piece, speed: number) {
  const volume = Math.min(1, 0.25 + speed / 16);
  if (piece.motion?.kind === 'flame') play('flame-step', { volume: volume * 0.6 });
  else if (WOODEN.includes(piece.art as (typeof WOODEN)[number])) playAny(['land-wood'], { volume });
  else playAny(['land-stone'], { volume });
  if (piece.art === art.ropeBridge) playAny(['bridge-creak-1', 'bridge-creak-2'], { volume: 0.5 });
  if (piece.art === art.vineBridge) playAny(['leaf-rustle-1', 'leaf-rustle-2'], { volume: 0.5 });
}

/**
 * The ninja. Left/Right run, Up jumps, and Up again while in the air does
 * one ninja high jump. He rides moving platforms, sets off crumbling blocks by landing
 * on them, makes false platforms vanish by getting close, gets pushed by the wind, and
 * falling off the level sends him back to the last glowing checkpoint he reached.
 * The art is drawn facing right and is flipped when he runs left.
 */
export function Ninja() {
  const ref = useRef<Group>(null);
  const [subscribeKeys, getKeys] = useKeyboardControls();
  // How he looks, and what he is saying (only in the ending)
  const [look, setLook] = useState<{ pose: Pose; facing: number; line: string }>({
    facing: 1,
    line: '',
    pose: 'ready'
  });
  const lookRef = useRef(look);
  const velocityY = useRef(0);
  const jumpTapped = useRef(false);
  const ninjaJumpUsed = useRef(false);
  const checkpoint = useRef({ ...START });
  const lastTime = useRef(0);
  const nextStepSound = useRef(0);

  // Catch every Up press the moment it happens, so quick double taps are never missed
  useEffect(
    () =>
      subscribeKeys(
        (state) => (state as Record<string, boolean>).jump,
        (down) => {
          if (down) jumpTapped.current = true;
        }
      ),
    [subscribeKeys]
  );

  useFrame((state, delta) => {
    const body = ref.current;
    if (!body) return;
    // Frozen while paused or talking to Ember (presses made meanwhile don't count)
    if (world.paused) {
      jumpTapped.current = false;
      return;
    }
    const dt = Math.min(delta, 1 / 30); // keep physics steady if a frame is slow
    const keys = getKeys() as Record<string, boolean>;
    const pos = body.position;
    const now = world.time;
    const before = lastTime.current || now;
    lastTime.current = now;

    const floor = floorBelow(pos.x, pos.y, now);
    const grounded = floor !== null && pos.y <= floor.y + 0.001 && velocityY.current <= 0;

    // Standing on a moving platform carries him along with it
    if (grounded && floor.piece.motion?.kind === 'drift') {
      pos.x += pieceState(floor.piece, now).dx - pieceState(floor.piece, before).dx;
    }
    // Landing on a falling block starts it shaking
    if (grounded) touch(floor.piece, now);
    // Getting close to a false platform makes it vanish
    level.forEach((piece) => {
      if (piece.motion?.kind !== 'false') return;
      const left = piece.x;
      const gap = Math.max(left - pos.x, pos.x - (left + widthOf(piece)), 0);
      if (gap < FALSE_TRIGGER && Math.abs(standHeight(piece, now) - pos.y) < 2) touch(piece, now);
    });

    // At the end of the journey he walks up to the lantern on his own (the keys do nothing)
    const since = endingTime(now);
    const ending = since !== null;
    let dx = Number(keys.right) - Number(keys.left);
    if (ending) {
      dx = Math.abs(STAND_X - pos.x) > 0.08 ? Math.sign(STAND_X - pos.x) : 0;
      jumpTapped.current = false;
    }
    // Run left/right; a bump too tall to step onto stops him like a wall
    if (dx !== 0) {
      const nextX = pos.x + dx * RUN_SPEED * dt;
      const ahead = floorBelow(nextX, pos.y + 1.2, now);
      const wall = grounded && ahead !== null && ahead.y > pos.y + MAX_STEP;
      // The overgrown bridge's vines block him until Ember burns them away
      const vines = vinesBlock(pos.x, nextX, pos.y, now);
      if (!wall && !vines) pos.x = Math.min(nextX, LEVEL_END); // the far wall of the last building
    }
    let { facing } = lookRef.current;
    if (dx !== 0) facing = dx;
    // He watches Ember light the lantern, then turns to look out over the glowing city
    if (ending && dx === 0) facing = since < T.pullIn ? 1 : -1;

    // Ember's rescue (PUSH_TOWARD_LEDGE) carries him in an arc onto a ledge
    const rescuing = now < world.ember.pushUntil;
    if (world.ember.launchVy) {
      velocityY.current = world.ember.launchVy;
      world.ember.launchVy = 0;
    }
    if (rescuing) pos.x += world.ember.pushSpeed * dt;
    // The wind pushes him left in the windy stretch, harder while he is in the air (not during a rescue)
    const wind = inWind(pos.x) && !rescuing ? WIND_ZONE.push * (grounded ? 0.5 : 1) : 0;
    pos.x += wind * dt;

    // Up on the ground jumps; Up again while in the air does one ninja high jump
    if (jumpTapped.current) {
      if (grounded) {
        velocityY.current = JUMP_SPEED;
        play('jump', { volume: 0.5 });
        ninjaJumpUsed.current = false;
      } else if (!ninjaJumpUsed.current) {
        velocityY.current = NINJA_JUMP_SPEED;
        play('high-jump', { rate: 1.15, volume: 0.7 });
        ninjaJumpUsed.current = true;
      }
    }
    jumpTapped.current = false;

    // Running along a surface: stick to it over small bumps and dips (and rising/sinking platforms)
    const below = floorBelow(pos.x, pos.y, now);
    const stick = grounded && velocityY.current <= 0 && below !== null && pos.y - below.y <= MAX_STEP;
    if (stick) {
      pos.y = below.y;
    } else {
      // In the air: gravity (gentle while Ember's SLOW_FALL is on), then land on whatever is below
      const slowFall = now < world.ember.slowFallUntil;
      velocityY.current -= GRAVITY * (slowFall ? 0.25 : 1) * dt;
      if (slowFall) velocityY.current = Math.max(velocityY.current, -2);
      const nextY = pos.y + velocityY.current * dt;
      if (below !== null && velocityY.current <= 0 && nextY <= below.y) {
        if (velocityY.current < -2) landSound(below.piece, -velocityY.current);
        pos.y = below.y;
        velocityY.current = 0;
        ninjaJumpUsed.current = false;
        world.ember.pushUntil = Math.min(world.ember.pushUntil, now); // a rescue ends on landing
        // Reaching a glowing checkpoint block saves your progress
        if (below.piece.checkpoint) {
          const x = below.piece.x + widthOf(below.piece) / 2;
          if (x !== checkpoint.current.x) play('checkpoint', { volume: 0.6 }); // a new checkpoint reached
          checkpoint.current = { x, y: below.y };
        }
      } else {
        pos.y = nextY;
      }
    }

    // Walking on the bridges: the broken rope bridge creaks, the leafy vine bridge rustles
    if (grounded && dx !== 0 && now >= nextStepSound.current) {
      const surface = floor.piece.art;
      if (surface === art.ropeBridge) {
        playAny(['bridge-creak-1', 'bridge-creak-2'], { volume: 0.35 });
        nextStepSound.current = now + 0.7 + Math.random() * 0.5;
      } else if (surface === art.vineBridge) {
        playAny(['leaf-rustle-1', 'leaf-rustle-2'], { volume: 0.4 });
        nextStepSound.current = now + 0.3 + Math.random() * 0.2;
      }
    }

    // Fell off: back to the last checkpoint
    if (pos.y < FALL_LIMIT) {
      pos.set(checkpoint.current.x, checkpoint.current.y, pos.z);
      velocityY.current = 0;
    }

    world.player.copy(pos);
    world.facing = facing;
    world.velocity.set(
      dx * RUN_SPEED + (now < world.ember.pushUntil ? world.ember.pushSpeed : 0),
      velocityY.current,
      0
    );
    world.grounded = floorBelow(pos.x, pos.y, now) !== null && velocityY.current === 0;

    // Which pose to show
    const onFloor = floorBelow(pos.x, pos.y, now) !== null && velocityY.current === 0;
    let pose: Pose = 'ready';
    if (!onFloor) {
      if (velocityY.current > 0) pose = ninjaJumpUsed.current ? 'rise' : 'leap';
      else pose = 'fall';
    } else if (dx !== 0) {
      pose = RUN_CYCLE[Math.floor(now * RUN_FPS) % RUN_CYCLE.length];
    }

    const line = ending ? lineFor('ninja', since) : '';
    if (pose !== lookRef.current.pose || facing !== lookRef.current.facing || line !== lookRef.current.line) {
      lookRef.current = { facing, line, pose };
      setLook(lookRef.current);
    }
  });

  return (
    <group ref={ref} position={[START.x, START.y, 1]}>
      <group scale={[look.facing, 1, 1]}>
        <GameSprite art={poses[look.pose]} />
      </group>
      {look.line && (
        <Html position={[0, 2.1, 0]} zIndexRange={[20, 0]}>
          {/* The ninja's speech bubble: teal border, like his scarf */}
          <div className="pointer-events-none relative -translate-x-1/2 -translate-y-full pb-3">
            <div className="relative w-56 rounded-md border-[3px] border-cyan-400 bg-[#0b1620] px-3 py-2 text-center font-pixel text-[9px] leading-4 text-cyan-50 shadow-[0_0_0_2px_#000]">
              {look.line}
              <div className="absolute -bottom-[9px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-[3px] border-r-[3px] border-cyan-400 bg-[#0b1620]" />
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
