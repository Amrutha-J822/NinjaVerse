import React, { useEffect, useRef, useState } from 'react';
import { Group, Mesh, Vector3 } from 'three';

import { Html, useKeyboardControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

import { world } from '../game/world';

import { heightOf, PixelSprite } from './sprites/PixelSprite';
import {
  chargingPod,
  jarvis,
  jarvisBot,
  jarvisWings,
  spiderman,
  SpidermanPose,
  WALK_FRAMES,
  webShot as webShotSprite,
  wings
} from './sprites';

export type Suit = 'normal' | 'jarvis';

interface CharacterProps {
  suit: Suit;
  position: [number, number, number];
  /** Rooftops the web swing can attach to (world coordinates). */
  webAnchors: [number, number, number][];
}

type Action = 'idle' | 'punch' | 'highKick' | 'slideKick';
type View = SpidermanPose;
type Look = { action: Action; facing: number; view: View };

const MOVE_SPEED = 4;
const JUMP_SPEED = 7;
const GRAVITY = 20;

// How long each attack pose lasts, in seconds
const ACTION_TIME: Record<Exclude<Action, 'idle'>, number> = { highKick: 0.35, punch: 0.25, slideKick: 0.45 };
const SLIDE_SPEED = 9;

const WEB_SPEED = 25;
const WEB_RANGE = 14;
const WEB_SHOT_HEIGHT = 3.6; // straight ahead at face height when no enemy is in front
const WEB_HIT_RADIUS = 1.2;
const BLIND_TIME = 3;
const WEB_SHOOT_POSE_TIME = 0.35;
const FIGHT_RANGE = 7; // fists up when an enemy is this close
// How hard each attack knocks an enemy back, and how far it reaches past his body
const KNOCKBACK: Record<Exclude<Action, 'idle'>, number> = { highKick: 14, punch: 9, slideKick: 11 };
const ATTACK_REACH = 1.4;
const SWING_RANGE = 16;
const SWING_APEX = 2; // how far above the higher of start/rooftop the swing arcs
const HAND_HEIGHT = 3;
const BODY_HALF_WIDTH = 1.05; // half the width of his body in the art
const WALK_FPS = 8;

// Rooftops you can land on: the building is 3 wide, and he stands just in front of its facade
const ROOF_HALF_WIDTH = 1.5;
const ROOF_BACK = 1;
const ROOF_FRONT = 1.2;
const ROOF_STAND_Z = 0.6;
const CROUCH_TIME = 0.6;

// Keys whose presses are caught the moment they happen, so quick taps are never missed
const TAP_KEYS = ['jump', 'punch', 'highKick', 'slideKick', 'kickOrSlide', 'web'];

const suitSprites = { jarvis, normal: spiderman };
const suitWings = { jarvis: jarvisWings, normal: wings };

/**
 * Spider-Man as flat 2D pixel art. Every pose is its own frame (see sprites/index.ts),
 * so punches and kicks move his own arms and legs, and walking plays a 4-frame cycle.
 *
 * Controls come from KeyboardControls (see config/controls.ts): arrows move,
 * space jumps, and the right- and left-handed combat keys trigger the attacks.
 */
export function ChibiSpiderman({ position, suit, webAnchors }: CharacterProps) {
  const ref = useRef<Group>(null);
  const webShotRef = useRef<Group>(null);
  const webLineRef = useRef<Mesh>(null);
  const [subscribeKeys, getKeys] = useKeyboardControls();
  const [isCharging, setIsCharging] = useState(false);
  const [chargeLevel, setChargeLevel] = useState(100);

  // Look drives what is rendered (pose, direction, which sprite); the refs below drive per-frame physics
  const [look, setLook] = useState<Look>({ action: 'idle', facing: 1, view: 'front' });
  const lookRef = useRef(look);
  const updateLook = (changes: Partial<Look>) => {
    const next = { ...lookRef.current, ...changes };
    const prev = lookRef.current;
    if (next.action !== prev.action || next.facing !== prev.facing || next.view !== prev.view) {
      lookRef.current = next;
      setLook(next);
    }
  };
  const action = useRef<{ type: Action; until: number }>({ type: 'idle', until: 0 });
  const prevKeys = useRef<Record<string, boolean>>({});
  const facing = useRef(1); // 1 = right, -1 = left
  const velocity = useRef({ x: 0, y: 0, z: 0 });
  const swingAnchor = useRef<Vector3 | null>(null);
  const tapped = useRef(new Set<string>());
  const slideComboHeld = useRef(false);
  const crouchUntil = useRef(0);
  const hw = BODY_HALF_WIDTH; // attacks reach out from the edge of his body
  const webShot = useRef({ active: false, dir: new Vector3(1, 0, 0), travelled: 0 });
  const webShootUntil = useRef(0);

  // Suit drains while active; at 0% he stops at the pod and recharges to 100%
  useEffect(() => {
    const id = setInterval(() => {
      setChargeLevel((c) => (isCharging ? Math.min(100, c + 20) : Math.max(0, c - 5)));
    }, 1000);
    return () => clearInterval(id);
  }, [isCharging]);

  useEffect(() => {
    if (chargeLevel === 0) setIsCharging(true);
    if (chargeLevel === 100) setIsCharging(false);
  }, [chargeLevel]);

  // Record every press as it happens; useFrame consumes them on the next frame
  useEffect(() => {
    const unsubscribe = TAP_KEYS.map((name) =>
      subscribeKeys(
        (state) => (state as Record<string, boolean>)[name],
        (down) => {
          if (down) tapped.current.add(name);
        }
      )
    );
    return () => unsubscribe.forEach((u) => u());
  }, [subscribeKeys]);

  // Height he is standing on at (x, z): a rooftop he is above, or the street
  const floorAt = (x: number, y: number, z: number) =>
    webAnchors.reduce(
      (floor, [bx, top, bz]) =>
        Math.abs(x - bx) <= ROOF_HALF_WIDTH && z >= bz - ROOF_BACK && z <= bz + ROOF_FRONT && y >= top - 0.05
          ? Math.max(floor, top)
          : floor,
      position[1]
    );

  const nearestAnchor = (from: Vector3) => {
    const distTo = ([x, , z]: [number, number, number]) => Math.hypot(x - from.x, z - from.z);
    // Skip the rooftop he is already standing on
    const inRange = webAnchors.filter((a) => distTo(a) <= SWING_RANGE && distTo(a) > 2);
    if (!inRange.length) return null;
    const [x, y, z] = inRange.reduce((best, a) => (distTo(a) < distTo(best) ? a : best));
    return new Vector3(x, y, z);
  };

  useFrame((state, delta) => {
    const body = ref.current;
    if (!body) return;
    const keys = getKeys() as Record<string, boolean>;
    const pressed = (name: string) => tapped.current.has(name) || (keys[name] && !prevKeys.current[name]);
    const now = state.clock.elapsedTime;
    const floor = floorAt(body.position.x, body.position.y, body.position.z);
    const grounded = body.position.y <= floor + 0.001 && velocity.current.y <= 0;

    // Finish the current attack
    if (action.current.type !== 'idle' && now >= action.current.until) {
      if (action.current.type === 'slideKick') velocity.current.x = 0;
      action.current = { type: 'idle', until: 0 };
      updateLook({ action: 'idle' });
    }
    const sliding = action.current.type === 'slideKick';

    // Up/down move along the street (up = away from the camera), left/right across it.
    // Holding two arrows moves diagonally at the same speed as a single arrow.
    const dx = Number(keys.right) - Number(keys.left);
    const dz = Number(keys.down) - Number(keys.up);

    // Slide kick: Down + X/S + Left/Right held together, in any order, slides toward that arrow
    const slideCombo = keys.down && (keys.slideKick || keys.kickOrSlide) && dx !== 0;
    const slideStarted = slideCombo && !slideComboHeld.current;
    slideComboHeld.current = slideCombo;

    if (!isCharging) {
      const length = Math.hypot(dx, dz);
      if (length > 0 && !sliding) {
        const step = (MOVE_SPEED * delta) / length;
        body.position.x += dx * step;
        body.position.z += dz * step;
      }
      if (dx !== 0 && !sliding) facing.current = dx;

      // Attacks fire the instant their key is pressed; a new attack cuts off the previous one
      const start = (type: Exclude<Action, 'idle'>) => {
        if (sliding) velocity.current.x = 0;
        action.current = { type, until: now + ACTION_TIME[type] };
        crouchUntil.current = 0;
        updateLook({ action: type, facing: facing.current });
        if (type === 'slideKick') velocity.current.x = facing.current * SLIDE_SPEED;
        // Knock back any enemy in reach on the side he is facing
        world.enemies.forEach((enemy) => {
          const ahead = (enemy.position.x - body.position.x) * facing.current;
          const inReach = ahead > 0 && ahead < hw + ATTACK_REACH + enemy.halfWidth;
          if (inReach && Math.abs(enemy.position.z - body.position.z) < 1.5 && body.position.y < floor + 3) {
            // eslint-disable-next-line no-param-reassign
            enemy.knockback = facing.current * KNOCKBACK[type];
          }
        });
      };
      if (slideStarted && grounded) {
        facing.current = dx;
        start('slideKick');
      } else if (pressed('highKick') || (pressed('kickOrSlide') && !keys.down)) {
        // K, or X on its own (with Down held, X is only ever part of the slide kick)
        start('highKick');
      } else if (pressed('punch')) {
        start('punch');
      }

      // Space jumps; V + Space webs onto the nearest rooftop and swings toward it
      let swung = false;
      if (pressed('jump') && grounded) {
        const anchor = keys.web ? nearestAnchor(body.position) : null;
        crouchUntil.current = 0;
        if (anchor) {
          // Arc up and land on the rooftop, just in front of the facade
          const target = new Vector3(anchor.x, anchor.y, anchor.z + ROOF_STAND_Z);
          const apex = Math.max(body.position.y, target.y) + SWING_APEX;
          const vy = Math.sqrt(2 * GRAVITY * (apex - body.position.y));
          const airtime = vy / GRAVITY + Math.sqrt((2 * (apex - target.y)) / GRAVITY);
          velocity.current = {
            x: (target.x - body.position.x) / airtime,
            y: vy,
            z: (target.z - body.position.z) / airtime
          };
          if (target.x !== body.position.x) facing.current = Math.sign(target.x - body.position.x);
          swingAnchor.current = anchor;
          // The web goes to the rooftop instead of flying at an enemy
          webShot.current.active = false;
          swung = true;
        } else {
          velocity.current.y = JUMP_SPEED;
        }
      }

      // V shoots web; it flies at the face of the nearest enemy in front of him to blind them
      if (pressed('web') && !swung && webShotRef.current) {
        const from = new Vector3(body.position.x + facing.current * 1.8, body.position.y + 3, body.position.z);
        const target = world.enemies
          .filter((e) => (e.face.x - from.x) * facing.current > 0 && e.face.distanceTo(from) < WEB_RANGE)
          .sort((a, b) => a.face.distanceTo(from) - b.face.distanceTo(from))[0];
        const dir = target
          ? target.face.clone().sub(from).normalize()
          : new Vector3(facing.current, (WEB_SHOT_HEIGHT - 3) / WEB_RANGE, 0).normalize();
        webShot.current = { active: true, dir, travelled: 0 };
        webShotRef.current.position.copy(from);
        webShotRef.current.scale.x = facing.current;
        webShotRef.current.rotation.z = Math.atan2(dir.y, Math.abs(dir.x)) * facing.current;
        webShootUntil.current = now + WEB_SHOOT_POSE_TIME;
      }
    }
    tapped.current.clear();
    prevKeys.current = { ...keys };

    // Horizontal momentum from slides and swings
    body.position.x += velocity.current.x * delta;
    body.position.z += velocity.current.z * delta;

    // Gravity pulls him down onto the street or a rooftop (walking off a roof makes him fall)
    const floorNow = floorAt(body.position.x, body.position.y, body.position.z);
    if (body.position.y > floorNow || velocity.current.y > 0) {
      velocity.current.y -= GRAVITY * delta;
      const nextY = body.position.y + velocity.current.y * delta;
      if (nextY <= floorNow && velocity.current.y <= 0) {
        body.position.y = floorNow;
        velocity.current.y = 0;
        if (swingAnchor.current) {
          swingAnchor.current = null;
          velocity.current.x = 0;
          velocity.current.z = 0;
        }
        // Crouch when landing on a building
        if (floorNow > position[1]) crouchUntil.current = now + CROUCH_TIME;
      } else {
        body.position.y = nextY;
      }
    }

    world.player.copy(body.position);

    // Which frame to show, most important first:
    // attack -> that attack's frame, shooting web -> web-shoot, in the air -> jump,
    // just landed on a building -> crouch, walking -> walk cycle,
    // enemy close -> fists up, otherwise stand facing the player
    const moving = dx !== 0 || dz !== 0;
    if (moving) crouchUntil.current = 0;
    const airborne = body.position.y > floorNow + 0.001;
    const enemyClose = world.enemies.some(
      (e) => Math.abs(e.position.x - body.position.x) < FIGHT_RANGE && Math.abs(e.position.z - body.position.z) < 3
    );
    let view: View = 'front';
    if (action.current.type !== 'idle') view = action.current.type;
    else if (now < webShootUntil.current) view = 'webShoot';
    else if (airborne) view = 'jump';
    else if (now < crouchUntil.current) view = 'crouch';
    else if (moving && !isCharging) view = WALK_FRAMES[Math.floor(now * WALK_FPS) % WALK_FRAMES.length];
    else if (enemyClose) view = 'fight';
    updateLook({ facing: facing.current, view });

    // Web shot flies straight ahead until it runs out of range
    const shot = webShotRef.current;
    if (shot) {
      if (webShot.current.active) {
        const step = WEB_SPEED * delta;
        shot.position.addScaledVector(webShot.current.dir, step);
        webShot.current.travelled += step;
        if (webShot.current.travelled > WEB_RANGE) webShot.current.active = false;
        // Web to the face blinds the enemy for a few seconds
        const hit = world.enemies.find((e) => e.face.distanceTo(shot.position) < WEB_HIT_RADIUS);
        if (hit) {
          hit.blindedUntil = now + BLIND_TIME;
          webShot.current.active = false;
        }
      }
      shot.visible = webShot.current.active;
    }

    // Web line from his hand to the rooftop while swinging
    const line = webLineRef.current;
    if (line) {
      const anchor = swingAnchor.current;
      line.visible = !!anchor;
      if (anchor) {
        const hand = new Vector3(body.position.x, body.position.y + HAND_HEIGHT, body.position.z);
        line.position.copy(hand).lerp(anchor, 0.5);
        line.lookAt(anchor);
        line.scale.set(1, 1, hand.distanceTo(anchor));
      }
    }
  });

  // Wings are out while he has enough charge to fly
  const flying = !isCharging && chargeLevel >= 50;
  const sprite = suitSprites[suit][look.view];
  // Flip the art so he faces the way he is going (symmetric art is never flipped)
  const mirror = sprite.faces && look.facing !== sprite.faces ? -1 : 1;

  return (
    <>
      <group ref={ref} position={position}>
        <group scale={[mirror, 1, 1]}>
          {/* Wings sit just behind him */}
          {flying && (
            <group position={[0, 2.2, -0.05]}>
              <PixelSprite sprite={suitWings[suit]} />
            </group>
          )}
          <PixelSprite sprite={sprite} />
        </group>

        {/* Jarvis robot helper hovers by his shoulder */}
        {suit === 'jarvis' && (
          <group position={[1.4, 3.6, 0.05]}>
            <PixelSprite sprite={jarvisBot} />
          </group>
        )}

        {/* Charging pod next to him while recharging */}
        {isCharging && (
          <group position={[1.6, 0, 0.05]}>
            <PixelSprite sprite={chargingPod} />
          </group>
        )}

        {/* Charge status */}
        <Html position={[0, heightOf(sprite) + 0.3, 0]} center>
          <div className="whitespace-nowrap bg-black/60 px-1.5 py-1 font-pixel text-[8px] text-white">
            {isCharging ? 'CHARGING' : 'CHARGE'} {chargeLevel}%
          </div>
        </Html>
      </group>

      {/* Web shot (world space, so it keeps flying after he moves) */}
      <group ref={webShotRef} visible={false}>
        <group position={[-0.5, -0.3, 0]}>
          <PixelSprite sprite={webShotSprite} />
        </group>
      </group>

      {/* Web line to the rooftop during a swing */}
      <mesh ref={webLineRef} visible={false}>
        <boxGeometry args={[0.1, 0.1, 1]} />
        <meshBasicMaterial color="white" toneMapped={false} />
      </mesh>
    </>
  );
}
