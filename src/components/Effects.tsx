import React, { useRef } from 'react';
import { AdditiveBlending, CanvasTexture, Group, Mesh, MeshBasicMaterial, NearestFilter } from 'three';

import { useFrame, useThree } from '@react-three/fiber';

import { vineState, WIND_ZONE } from '../game/level';
import { world } from '../game/world';

/** Pixel texture drawn once into a canvas. */
function pixelTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d') as CanvasRenderingContext2D);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
}

// A soft glow in stepped rings, so it still reads as pixel art
const glowTexture = pixelTexture(32, (ctx) => {
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      const a = Math.floor(Math.max(0, 1 - d) * 4) / 4;
      if (a > 0) {
        ctx.fillStyle = `rgba(255,255,255,${a * 0.55})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
});

/** A colored glow behind something (checkpoint blocks, false platforms). */
export function Glow({ color, pulse = 0, size }: { color: string; size: number; pulse?: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    if (ref.current && pulse) ref.current.scale.setScalar(1 + Math.sin(world.time * 4) * pulse);
  });
  return (
    <mesh ref={ref} position={[0, 0, -0.05]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        blending={AdditiveBlending}
        color={color}
        depthWrite={false}
        map={glowTexture}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

// Same pseudo-random numbers every time, so effects look the same each play
const rand = (i: number, salt: number) => {
  const n = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

/**
 * Bits of stone (or red sparks) dropping from a platform while it crumbles.
 * `age` gives seconds since it started, or null when nothing is happening.
 */
export function Debris({ age, color, width }: { age: () => number | null; color: string; width: number }) {
  const group = useRef<Group>(null);
  const bits = 8;
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = age();
    g.visible = t !== null && t < 1.6;
    if (t === null) return;
    g.children.forEach((child, i) => {
      const bit = child;
      const start = rand(i, 1) * 0.5; // bits fall one after another
      const life = Math.max(0, t - start);
      bit.position.set(rand(i, 2) * width, -0.05 - 0.5 * 9 * life * life, 0.02);
      bit.visible = t > start;
    });
  });
  return (
    <group ref={group} visible={false}>
      {Array.from({ length: bits }, (_, i) => (
        <mesh key={i}>
          <planeGeometry args={[0.07 + rand(i, 3) * 0.06, 0.07 + rand(i, 4) * 0.06]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// A small pixel leaf, like the leaves on the vine bridge
const leafTexture = pixelTexture(8, (ctx) => {
  const rows = ['........', '..aab...', '.abbcb..', 'abccccba', '.abccba.', '..aab...', '........', '........'];
  const colors: Record<string, string> = { a: '#1d4a1f', b: '#2f7a2c', c: '#4fb043' };
  rows.forEach((row, y) =>
    row.split('').forEach((k, x) => {
      if (k === '.') return;
      ctx.fillStyle = colors[k];
      ctx.fillRect(x, y, 1, 1);
    })
  );
});

const LEAVES = 22;
const STREAKS = 10;

/** Wind in the windy stretch: leaves and streaks blowing left across the view. */
export function Wind() {
  const group = useRef<Group>(null);
  const { camera, size } = useThree();
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const zoom = (camera as unknown as { zoom: number }).zoom || 1;
    const halfW = size.width / zoom / 2;
    const halfH = size.height / zoom / 2;
    // Only blow while the view overlaps the windy stretch
    const view0 = camera.position.x - halfW;
    const view1 = camera.position.x + halfW;
    g.visible = view1 > WIND_ZONE.x0 && view0 < WIND_ZONE.x1;
    if (!g.visible) return;
    const t = world.time;
    const span = halfW * 2 + 2;
    g.children.forEach((mesh, i) => {
      const child = mesh;
      const leaf = i < LEAVES;
      const speed = leaf ? 3 + rand(i, 5) * 2 : 9 + rand(i, 6) * 4;
      const travelled = (rand(i, 7) * span + t * speed) % span;
      const x = view1 + 1 - travelled;
      const y = camera.position.y - halfH + rand(i, 8) * halfH * 2 + Math.sin(t * 2 + i) * 0.2;
      child.position.set(x, y, 2);
      child.rotation.z = leaf ? Math.sin(t * 3 + i) * 0.8 : 0;
      child.visible = x > WIND_ZONE.x0 && x < WIND_ZONE.x1;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: LEAVES }, (_, i) => (
        <mesh key={`leaf${i}`}>
          <planeGeometry args={[0.24, 0.24]} />
          <meshBasicMaterial alphaTest={0.5} map={leafTexture} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: STREAKS }, (_, i) => (
        <mesh key={`streak${i}`}>
          <planeGeometry args={[1.2, 0.04]} />
          <meshBasicMaterial color="#cfe0ff" depthWrite={false} opacity={0.35} toneMapped={false} transparent />
        </mesh>
      ))}
    </group>
  );
}

// --- burnable vines -----------------------------------------------------------

const VINE_PX_W = 90;
const VINE_PX_H = 340;

// A wall of tangled vines in the vine bridge's greens: wavy stems, leaves and thorns
const vineTexture = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = VINE_PX_W;
  canvas.height = VINE_PX_H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const dot = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  for (let stem = 0; stem < 9; stem += 1) {
    const base = 6 + stem * 9.5;
    for (let y = 0; y < VINE_PX_H; y += 1) {
      const x = base + Math.sin(y / (9 + stem * 2) + stem) * 5;
      dot(x - 1, y, '#10260f');
      dot(x, y, '#2f6a28');
      dot(x + 1, y, '#3f8a33');
      dot(x + 2, y, '#10260f');
      if (y % 23 === stem * 4) {
        // a leaf off to the side
        const side = stem % 2 ? 1 : -1;
        for (let i = 1; i < 6; i += 1) {
          for (let j = -1; j <= 1; j += 1) dot(x + side * (i + 1), y + j - i / 2, j === 0 ? '#5cbf4a' : '#2f7a2c');
        }
      }
      if (y % 17 === stem) dot(x + 3, y, '#7a2a20'); // thorn
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
})();

const vineStateNow = () => vineState(world.time);

/** The vine wall: tangled vines blocking the bridge, burning and gone after Ember's fire. */
export function VineWall({ base, height, width, x }: { base: number; height: number; width: number; x: number }) {
  const sprite = useRef<Mesh>(null);
  const flames = useRef<Group>(null);
  useFrame(() => {
    const state = vineStateNow();
    if (sprite.current) {
      sprite.current.visible = !state.gone;
      const material = sprite.current.material as MeshBasicMaterial;
      // While burning the vines flicker orange
      material.color.set(state.burning && Math.floor(world.time * 12) % 2 ? '#ff9a40' : '#ffffff');
    }
    if (flames.current) {
      flames.current.visible = state.burning;
      if (state.burning) {
        flames.current.children.forEach((mesh, i) => {
          const flame = mesh;
          const rise = (world.time * 2.2 + rand(i, 9)) % 1;
          flame.position.set((rand(i, 10) - 0.5) * width * 1.6, rand(i, 11) * height * 0.9 + rise * 0.8, 0.05);
          flame.scale.setScalar(1 - rise * 0.7);
        });
      }
    }
  });
  return (
    <group position={[x + width / 2, base, 0.1]}>
      <mesh ref={sprite} position={[0, height / 2, 0]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial alphaTest={0.5} map={vineTexture} toneMapped={false} />
      </mesh>
      <group ref={flames} visible={false}>
        {Array.from({ length: 18 }, (_, i) => (
          <mesh key={i}>
            <planeGeometry args={[0.14, 0.14]} />
            <meshBasicMaterial color={i % 3 ? '#ff8a20' : '#ffe060'} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Ember's fire breath: a stream of flame from the fireball to the vines while burning. */
export function FireBreath({ target }: { target: [number, number] }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.visible = world.time < world.ember.burnUntil;
    if (!g.visible) return;
    const from = world.fireball;
    g.children.forEach((mesh, i) => {
      const bit = mesh;
      const f = (world.time * 2.5 + i / g.children.length) % 1;
      const wobble = Math.sin(world.time * 20 + i) * 0.12 * f;
      bit.position.set(from.x + (target[0] - from.x) * f, from.y + (target[1] - from.y) * f + wobble, 1.5);
      bit.scale.setScalar(0.6 + f * 1.2);
    });
  });
  return (
    <group ref={group} visible={false}>
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i}>
          <planeGeometry args={[0.12, 0.12]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color={i % 2 ? '#ffb030' : '#ff5a10'}
            toneMapped={false}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

// --- rescue flame trail -----------------------------------------------------------

const TRAIL = 40;

/** A glowing trail behind Ember while it carries the ninja to a ledge. */
export function FlameTrail() {
  const group = useRef<Group>(null);
  const points = useRef<{ x: number; y: number }[]>([]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const active = world.time < world.ember.pushUntil + 0.5;
    if (active && !world.paused) {
      points.current.unshift({ x: world.fireball.x, y: world.fireball.y });
      points.current.length = Math.min(points.current.length, TRAIL);
    } else if (!active) {
      points.current = [];
    }
    g.children.forEach((mesh, i) => {
      const dot = mesh;
      const p = points.current[i];
      dot.visible = !!p;
      if (p) {
        dot.position.set(p.x + Math.sin(i * 1.7 + world.time * 6) * 0.08, p.y + Math.cos(i * 1.3) * 0.06, 0.8);
        dot.scale.setScalar(1 - i / TRAIL);
      }
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: TRAIL }, (_, i) => (
        <mesh key={i}>
          <planeGeometry args={[0.22, 0.22]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color={i % 3 ? '#ff9a2a' : '#ffe27a'}
            depthWrite={false}
            map={glowTexture}
            toneMapped={false}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}
