import React, { useRef, useState } from 'react';
import { Group } from 'three';

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

import { art } from '../game/art';
import {
  floorBelow,
  inDark,
  level,
  nextPlatform,
  standHeight,
  START,
  VINE_WALL,
  vineWallBase,
  widthOf
} from '../game/level';
import { world } from '../game/world';

import { GameSprite } from './GameSprite';

const FLICKER = [art.fireball1, art.fireball2, art.fireball3, art.fireball4];
const FLICKER_FPS = 8;
const FOLLOW = 3; // how quickly it catches up when following the ninja
const GUIDE = 5; // how quickly it flies to a platform it is showing
const BEHIND = 1.1; // floats this far behind his shoulder
const ABOVE = 1.6;
const HOVER = 1.1; // height above a platform it is lighting or warning about
const RESCUE = 7; // how quickly it flies ahead to the ledge during a rescue

/**
 * Ember, the fireball companion. Usually floats behind the ninja's shoulder, bobbing
 * and flickering. In the dark stretch it flies ahead and hovers over the next real
 * platform (never a false one) so its light shows where to jump.
 * When warning about a crumbling block it hovers over that block. Its hints and replies
 * show in a speech bubble.
 */
export function Fireball() {
  const ref = useRef<Group>(null);
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  // What the speech bubble shows ('' when hidden), and whether the warning "!" is up
  const [bubble, setBubble] = useState({ text: '', warning: false });
  const bubbleRef = useRef(bubble);

  useFrame((_, delta) => {
    const ball = ref.current;
    if (!ball || world.paused) return;
    const t = world.time;
    const bob = Math.sin(t * 3) * 0.12;

    // Where to be (later rules win): behind the ninja's shoulder, over the next platform in
    // the dark, over a platform being warned about, by the vines while burning them, or
    // ahead at the ledge during a rescue
    const warned = t < world.ember.warnUntil ? level.find((p) => p.id === world.ember.warnPieceId) : undefined;
    const on = floorBelow(world.player.x, world.player.y, t)?.piece;
    // Never guide him onto a false platform
    const next = nextPlatform(world.player.x, world.facing, t, on, (p) => p.motion?.kind === 'false');
    const nextCenter = next ? next.piece.x + widthOf(next.piece) / 2 : 0;
    const guiding = next && (inDark(world.player.x) || inDark(nextCenter));
    let targetX = world.player.x - world.facing * BEHIND;
    let targetY = world.player.y + ABOVE + bob;
    let speed = FOLLOW;
    const target = warned ?? (guiding ? next.piece : undefined);
    if (target) {
      targetX = target.x + widthOf(target) / 2;
      targetY = standHeight(target, t) + HOVER + bob;
      speed = GUIDE;
    }
    // Breathing fire at the vines: hover just in front of them
    if (t < world.ember.burnUntil) {
      targetX = VINE_WALL.x - world.facing * 1.1;
      targetY = vineWallBase() + 1.9 + bob;
      speed = GUIDE;
    }
    // Rescue: fly ahead to the ledge so the ninja can follow the flame
    if (t < world.ember.pushUntil) {
      targetX = world.ember.rescueX;
      targetY = world.ember.rescueY + HOVER + bob;
      speed = RESCUE;
    }

    const k = 1 - Math.exp(-speed * delta);
    ball.position.x += (targetX - ball.position.x) * k;
    ball.position.y += (targetY - ball.position.y) * k;
    world.fireball.copy(ball.position);

    // Show or hide the speech bubble the moment Ember's message changes
    const text = t < world.ember.replyUntil ? world.ember.reply : '';
    const warning = t < world.ember.warnUntil;
    if (text !== bubbleRef.current.text || warning !== bubbleRef.current.warning) {
      bubbleRef.current = { text, warning };
      setBubble(bubbleRef.current);
    }

    const nextFrame = Math.floor(t * FLICKER_FPS) % FLICKER.length;
    if (nextFrame !== frameRef.current) {
      frameRef.current = nextFrame;
      setFrame(nextFrame);
    }
  });

  const { text: talking, warning } = bubble;

  return (
    <group ref={ref} position={[START.x - BEHIND, START.y + ABOVE, 0.9]}>
      <GameSprite art={FLICKER[frame]} anchor="center" />
      {(talking || warning) && (
        <Html position={[0, 0.55, 0]} zIndexRange={[20, 0]}>
          {/* Speech bubble: dark box with a gold border, its tail pointing down at Ember.
              It sits mostly to Ember's right, so it stays on screen at the start of the level. */}
          <div className="pointer-events-none relative -translate-x-[20%] -translate-y-full pb-3">
            {warning && (
              <div className="mb-1 w-60 pl-[20%] font-pixel text-lg text-red-500 [text-shadow:2px_2px_0_#000]">!</div>
            )}
            {talking && (
              <div className="relative w-60 rounded-md border-[3px] border-amber-400 bg-[#120f1a] px-3 py-2 text-center font-pixel text-[9px] leading-4 text-amber-100 shadow-[0_0_0_2px_#000]">
                {talking}
                <div className="absolute -bottom-[9px] left-[20%] h-3 w-3 -translate-x-1/2 rotate-45 border-b-[3px] border-r-[3px] border-amber-400 bg-[#120f1a]" />
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
