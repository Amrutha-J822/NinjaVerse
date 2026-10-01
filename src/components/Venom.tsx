import React, { useEffect, useRef, useState } from 'react';
import { Group, Vector3 } from 'three';

import { useFrame } from '@react-three/fiber';

import { Enemy, world } from '../game/world';

import { PixelSprite } from './sprites/PixelSprite';
import { venom, VENOM_FACE, VenomPose, webSplat } from './sprites';

const WALK_SPEED = 2;
const WALK_FPS = 6;
const BREATH_FPS = 2;
const HALF_WIDTH = 1.4; // half his body width
const STOP_DISTANCE = 0.6; // gap he keeps from Spider-Man
const ATTACK_RANGE = 3.2; // claws reach this far from his center
const WIND_UP = 0.3;
const SWIPE = 0.25;
const ATTACK_COOLDOWN = 1.2;
const KNOCKBACK_DECAY = 5;
const HURT_SPEED = 2; // shows the hurt frame while being knocked back faster than this

/**
 * Venom, the hard-level enemy, in the same pixel-art style as Spider-Man.
 * He stalks Spider-Man with a walk cycle, breathes while standing, winds up and
 * swipes with his claws when in reach, staggers when hit, and claws at his face
 * while blinded by web.
 */
export function Venom({ start }: { start: [number, number, number] }) {
  const ref = useRef<Group>(null);
  const [look, setLook] = useState<{ pose: VenomPose; facing: number }>({ facing: -1, pose: 'idle0' });
  const lookRef = useRef(look);
  const attack = useRef({ cooldownUntil: 0, startedAt: -1 });
  const [enemy] = useState<Enemy>(() => ({
    blindedUntil: 0,
    face: new Vector3(),
    halfWidth: HALF_WIDTH,
    knockback: 0,
    position: new Vector3(...start)
  }));

  useEffect(() => {
    world.enemies.push(enemy);
    return () => {
      world.enemies = world.enemies.filter((e) => e !== enemy);
    };
  }, [enemy]);

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;
    const pos = enemy.position;
    const blinded = now < enemy.blindedUntil;
    const hurt = Math.abs(enemy.knockback) > HURT_SPEED;
    const toPlayer = world.player.x - pos.x;
    let { facing } = lookRef.current;
    let pose: VenomPose;

    if (blinded) {
      attack.current.startedAt = -1;
      pose = 'blinded';
    } else if (hurt) {
      attack.current.startedAt = -1;
      pose = 'hurt';
    } else {
      facing = toPlayer >= 0 ? 1 : -1;
      const inReach = Math.abs(toPlayer) < ATTACK_RANGE + HALF_WIDTH && Math.abs(world.player.z - pos.z) < 1.5;

      // Start a claw attack when Spider-Man is in reach
      if (attack.current.startedAt < 0 && inReach && now >= attack.current.cooldownUntil) {
        attack.current.startedAt = now;
      }
      const attackTime = now - attack.current.startedAt;
      if (attack.current.startedAt >= 0 && attackTime < WIND_UP + SWIPE) {
        pose = attackTime < WIND_UP ? 'attack0' : 'attack1';
      } else {
        if (attack.current.startedAt >= 0) {
          attack.current = { cooldownUntil: now + ATTACK_COOLDOWN, startedAt: -1 };
        }
        // Close the distance, walking in depth too
        const gap = Math.abs(toPlayer) - HALF_WIDTH - STOP_DISTANCE;
        const stepX = gap > 0 ? facing * Math.min(gap, WALK_SPEED * delta) : 0;
        const toZ = world.player.z - pos.z;
        const stepZ = Math.sign(toZ) * Math.min(Math.abs(toZ), WALK_SPEED * delta);
        pos.x += stepX;
        pos.z += stepZ;
        const walking = Math.abs(stepX) + Math.abs(stepZ) > 0.0001;
        pose = walking
          ? (`walk${Math.floor(now * WALK_FPS) % 4}` as VenomPose)
          : (`idle${Math.floor(now * BREATH_FPS) % 2}` as VenomPose);
      }
    }

    // Knocked back by hits, slowing down quickly
    pos.x += enemy.knockback * delta;
    enemy.knockback *= Math.exp(-KNOCKBACK_DECAY * delta);

    // Art faces left; flip the face position with him
    enemy.face.set(pos.x - facing * VENOM_FACE.x, pos.y + VENOM_FACE.y, pos.z);
    ref.current?.position.copy(pos);

    if (pose !== lookRef.current.pose || facing !== lookRef.current.facing) {
      lookRef.current = { facing, pose };
      setLook(lookRef.current);
    }
  });

  const sprite = venom[look.pose];
  const mirror = look.facing === sprite.faces ? 1 : -1;

  return (
    <group ref={ref} position={start}>
      <group scale={[mirror, 1, 1]}>
        <PixelSprite sprite={sprite} />
        {/* Web over his face while blinded */}
        {look.pose === 'blinded' && (
          <group position={[VENOM_FACE.x, VENOM_FACE.y - 0.55, 0.05]}>
            <PixelSprite sprite={webSplat} />
          </group>
        )}
      </group>
    </group>
  );
}
