import React, { useRef } from 'react';
import { AdditiveBlending, CanvasTexture, Group, Mesh, NearestFilter } from 'three';

import { useFrame, useThree } from '@react-three/fiber';

import {
  FLAME_GAP,
  flamePathState,
  flamePathY,
  flameSteps,
  pieceState,
  standHeight,
  widthOf,
  WIND_ZONE
} from '../game/level';
import { world } from '../game/world';

/** Pixel texture drawn once into a canvas. */
function pixelTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void, height = size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = height;
  draw(canvas.getContext('2d') as CanvasRenderingContext2D);
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
}

// Same pseudo-random numbers every time, so effects look the same each play
const rand = (i: number, salt: number) => {
  const n = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

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

// --- burnable vines ---------------------------------------------------------------

const BREATH = 48;
const FLAME_COLORS = ['#fff2a0', '#ffd040', '#ff9a20', '#ff5a10'];

/** Ember's fire breath: a cone of flame from the fireball to the vines, widening as it goes. */
export function FireBreath({ target: aim }: { target: () => [number, number] }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.visible = world.time < world.ember.burnUntil;
    if (!g.visible) return;
    const from = world.fireball;
    const target = aim();
    const dx = target[0] - from.x;
    const dy = target[1] - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length; // across the stream
    const ny = dx / length;
    g.children.forEach((mesh, i) => {
      const bit = mesh;
      const f = (world.time * 2.2 + rand(i, 16)) % 1; // how far along the stream
      const spread = (rand(i, 17) - 0.5) * f * 1.3 + Math.sin(world.time * 18 + i) * 0.06;
      bit.position.set(from.x + dx * f + nx * spread, from.y + dy * f + ny * spread, 1.5);
      bit.scale.setScalar(0.5 + f * 1.6);
    });
  });
  return (
    <group ref={group} visible={false}>
      {Array.from({ length: BREATH }, (_, i) => (
        <mesh key={i}>
          <planeGeometry args={[0.24, 0.24]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color={FLAME_COLORS[i % FLAME_COLORS.length]}
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

// --- rescue flame trail -----------------------------------------------------------

const TRAIL = 50; // positions remembered behind Ember
const SPARKS = 24;

/**
 * Ember's fiery trail during a rescue: two strands of flame swirling around its path
 * (widening toward the tail) and sparks drifting off, so the ninja can follow the flame.
 */
export function FlameTrail() {
  const group = useRef<Group>(null);
  const points = useRef<{ x: number; y: number }[]>([]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const active = world.time < world.ember.pushUntil + 0.6;
    if (active && !world.paused) {
      points.current.unshift({ x: world.fireball.x, y: world.fireball.y });
      points.current.length = Math.min(points.current.length, TRAIL);
    } else if (!active) {
      points.current = [];
    }
    const pts = points.current;
    const t = world.time;
    g.children.forEach((mesh, i) => {
      const dot = mesh;
      if (i < TRAIL * 2) {
        // Ribbon: strand A for even meshes, strand B (opposite phase) for odd ones
        const k = Math.floor(i / 2);
        const p = pts[k];
        const q = pts[Math.min(k + 1, pts.length - 1)];
        dot.visible = !!p && !!q;
        if (!p || !q) return;
        const len = Math.hypot(p.x - q.x, p.y - q.y) || 1;
        const nx = -(p.y - q.y) / len;
        const ny = (p.x - q.x) / len;
        const phase = i % 2 ? Math.PI : 0;
        const swirl = Math.sin(k * 0.45 - t * 10 + phase) * (0.05 + (k / TRAIL) * 0.45);
        dot.position.set(p.x + nx * swirl, p.y + ny * swirl, 0.8);
        dot.scale.setScalar(1.4 - (k / TRAIL) * 1.1);
      } else {
        // Sparks drifting off the trail
        const s = i - TRAIL * 2;
        const p = pts[Math.floor(rand(s, 18) * pts.length)];
        dot.visible = !!p;
        if (!p) return;
        const drift = (t * 1.5 + rand(s, 19)) % 1;
        dot.position.set(p.x + (rand(s, 20) - 0.5) * 0.8, p.y + (rand(s, 21) - 0.5) * 0.6 + drift * 0.4, 0.85);
        dot.scale.setScalar(1 - drift);
      }
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: TRAIL * 2 + SPARKS }, (_, i) => (
        <mesh key={i}>
          <planeGeometry args={i < TRAIL * 2 ? [0.26, 0.26] : [0.07, 0.07]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color={i < TRAIL * 2 ? FLAME_COLORS[Math.floor(i / 2) % 3 === 0 ? 1 : 2] : '#ffe27a'}
            depthWrite={false}
            map={i < TRAIL * 2 ? glowTexture : null}
            toneMapped={false}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Fire on the overgrown bridge while its vines burn: flames riding the burning front as
 * it sweeps across, and embers dropping below it, like the picture.
 */
export function BridgeFire({ front, width }: { front: () => { burning: boolean; front: number }; width: number }) {
  const group = useRef<Group>(null);
  const flames = 44;
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const state = front();
    g.visible = state.burning;
    if (!state.burning) return;
    const at = state.front * width;
    g.children.forEach((mesh, i) => {
      const bit = mesh;
      const along = Math.min(width, Math.max(0, at + (rand(i, 12) - 0.75) * 1.4)); // mostly just behind the front
      if (i >= flames) {
        const fall = (world.time * 0.9 + rand(i, 13)) % 1;
        bit.position.set(along, -0.2 - fall * 2, 0.2);
        bit.scale.setScalar(1 - fall * 0.6);
      } else {
        const rise = (world.time * 2.4 + rand(i, 14)) % 1;
        bit.position.set(along + Math.sin(world.time * 9 + i) * 0.08, -0.6 + rand(i, 15) * 1.6 + rise * 0.9, 0.2);
        bit.scale.setScalar(1.5 - rise);
      }
    });
  });
  return (
    <group ref={group} visible={false}>
      {Array.from({ length: flames + 30 }, (_, i) => (
        <mesh key={i}>
          <planeGeometry args={i < flames ? [0.3, 0.3] : [0.08, 0.08]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color={['#ffe070', '#ff9a20', '#ff5a10'][i % 3]}
            depthWrite={false}
            map={i < flames ? glowTexture : null}
            toneMapped={false}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

// --- flame path across the wide gap ----------------------------------------------

/**
 * A flame step in pixels: a glowing slab of fire (lower half) with tongues of flame
 * licking up from it (upper half). `frame` changes the tongues so the steps flicker.
 */
const flameStepTexture = (frame: number) =>
  pixelTexture(
    32,
    (ctx) => {
      const paint = (color: string, x: number, y: number) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      };
      for (let x = 0; x < 32; x += 1) {
        const end = Math.min(x, 31 - x); // rounded ends
        const top = 6 + (end < 2 ? 2 - end : 0);
        const bottom = 11 - (end < 3 ? 3 - end : 0);
        for (let y = top; y <= bottom; y += 1) {
          let color = '#ff9a20';
          if (y === top) color = '#fff2a0';
          else if (y === top + 1) color = '#ffd040';
          else if (y === bottom) color = '#c8360a';
          else if (y === bottom - 1) color = '#ff5a10';
          paint(color, x, y);
        }
        // Tongues of flame above the slab
        const tongue = Math.floor(rand(x, 30 + frame) * 5) * (end < 2 ? 0 : 1);
        for (let y = 0; y < tongue; y += 1) paint(y === tongue - 1 ? '#ffd040' : '#ff9a20', x, 5 - y);
      }
    },
    12
  );
const flameFrames = [0, 1, 2].map(flameStepTexture);
const STEP_W = 1.0; // world size of a flame step picture
const STEP_H = 0.375;
const RIBBON = 220; // points along each strand of the flame path (close enough to read as a solid line)
const HALOS = 60; // soft glow along the path
const PATH_SPARKS = 30;

/**
 * Where a strand of the flame path is at x. The two strands wind around the path in
 * opposite phase, curling into loops in places, like the swirls in the picture.
 */
function strandAt(x: number, strand: number, t: number): [number, number] {
  const phase = strand * Math.PI + x * 2.4 - t * 1.5;
  const curl = 0.22 + 0.32 * Math.max(0, Math.sin(x * 0.9 + 1)); // wide enough here to loop
  return [x + Math.cos(phase) * curl, flamePathY(x) - 0.15 + Math.sin(phase) * 0.3];
}

/**
 * The flame path Ember draws across the gap that is too wide to jump, like the picture:
 * two thick strands of fire swirling around each other from the rooftop to the last
 * building, glowing and shedding sparks, with flame steps along it that the ninja can land on.
 * Everything appears as Ember's flame reaches it, and stays lit afterwards.
 */
export function FlamePath() {
  const ribbon = useRef<Group>(null);
  const steps = useRef<Group>(null);
  useFrame(() => {
    const t = world.time;
    const { head, started } = flamePathState(t);
    const r = ribbon.current;
    if (r) {
      r.visible = started;
      const span = FLAME_GAP.x1 - FLAME_GAP.x0;
      r.children.forEach((mesh, i) => {
        const dot = mesh;
        if (i < RIBBON * 2) {
          // The two strands: crisp pixel lines of fire, a little thicker where just drawn
          const k = Math.floor(i / 2);
          const x = FLAME_GAP.x0 + (k / (RIBBON - 1)) * span;
          const [px, py] = strandAt(x, i % 2, t);
          dot.visible = x <= head;
          dot.position.set(px, py, 0.8 + (i % 2) * 0.01);
          dot.scale.setScalar(head - x < 0.8 ? 1.4 : 1);
        } else if (i < RIBBON * 2 + HALOS) {
          // Glow around the strands
          const h = i - RIBBON * 2;
          const x = FLAME_GAP.x0 + ((h + 0.5) / HALOS) * span;
          const [px, py] = strandAt(x, h % 2, t);
          dot.visible = x <= head;
          dot.position.set(px, py, 0.75);
          dot.scale.setScalar(1 + Math.sin(t * 7 + h) * 0.15);
        } else {
          // Sparks drifting up off the drawn part of the path
          const s = i - RIBBON * 2 - HALOS;
          const x = FLAME_GAP.x0 + rand(s, 31) * (head - FLAME_GAP.x0);
          const drift = (t * 0.8 + rand(s, 32)) % 1;
          dot.visible = head > FLAME_GAP.x0 + 0.2;
          dot.position.set(x + Math.sin(t * 2 + s) * 0.1, flamePathY(x) + 0.1 + drift * 0.9, 0.85);
          dot.scale.setScalar(1 - drift);
        }
      });
    }
    const g = steps.current;
    if (g) {
      const frame = Math.floor(t * 8) % flameFrames.length;
      g.children.forEach((child, i) => {
        const step = child;
        const piece = flameSteps[i];
        const { visible } = pieceState(piece, t);
        step.visible = visible;
        if (!visible) return;
        // Pop in as the flame reaches it
        const age = Math.min(1, (head - (piece.x + widthOf(piece))) / 0.6);
        step.scale.setScalar(0.4 + 0.6 * Math.max(0, age));
        const sprite = step.children[1] as Mesh;
        (sprite.material as { map: unknown }).map = flameFrames[(frame + i) % flameFrames.length];
      });
    }
  });
  return (
    <>
      <group ref={ribbon} visible={false}>
        {Array.from({ length: RIBBON * 2 }, (_, i) => (
          <mesh key={`strand${i}`}>
            <planeGeometry args={[0.11, 0.11]} />
            <meshBasicMaterial color={i % 2 ? '#ff8a1c' : '#ffd040'} toneMapped={false} />
          </mesh>
        ))}
        {Array.from({ length: HALOS }, (_, i) => (
          <mesh key={`halo${i}`}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshBasicMaterial
              blending={AdditiveBlending}
              color="#ff7a18"
              depthWrite={false}
              map={glowTexture}
              toneMapped={false}
              transparent
            />
          </mesh>
        ))}
        {Array.from({ length: PATH_SPARKS }, (_, i) => (
          <mesh key={`spark${i}`}>
            <planeGeometry args={[0.07, 0.07]} />
            <meshBasicMaterial color="#ffe27a" toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group ref={steps}>
        {flameSteps.map((piece) => (
          <group key={piece.id} position={[piece.x + widthOf(piece) / 2, standHeight(piece, 0), 0.85]} visible={false}>
            <Glow color="#ff8a20" size={1.7} pulse={0.06} />
            <mesh>
              <planeGeometry args={[STEP_W, STEP_H]} />
              <meshBasicMaterial alphaTest={0.5} map={flameFrames[0]} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </>
  );
}
