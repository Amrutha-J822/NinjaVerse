import React, { useEffect, useMemo } from 'react';
import { CanvasTexture, NearestFilter, RepeatWrapping, sRGBEncoding } from 'three';

import { Building } from '../types/jarvis';

export type TimeOfDay = 'morning' | 'evening' | 'night';

const skyColors: Record<TimeOfDay, string> = {
  morning: '#87ceeb', // light sky blue
  evening: '#4b0082', // indigo
  night: '#0b0b0b' // near black
};

// The street is darkened at dusk and night (buildings bake the time of day into their windows)
const streetTint: Record<TimeOfDay, string> = {
  morning: '#ffffff',
  evening: '#b9a7d6',
  night: '#5a5f7a'
};

/** Jarvis ground coordinates to world [x, z]: x maps to x, y maps to z. */
const toGround = (x: number, y: number): [number, number] => [x, -y - 4];

/** World position of a building's rooftop, where web swings attach. */
export const buildingTop = (b: Building): [number, number, number] => {
  const [x, z] = toGround(b.x, b.y);
  return [x, b.height, z];
};

// Everything is pixel art at the same scale as the characters: 1 texture pixel = 0.1 world units
const PX = 0.1;

/** Draw pixels into a crisp (nearest-neighbor) texture, optionally tiled across a surface. */
const pixelTexture = (
  width: number,
  height: number,
  draw: (px: (x: number, y: number, color: string) => void) => void,
  repeat?: [number, number]
) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  draw((x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  });
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.encoding = sRGBEncoding;
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
};

// Small deterministic noise so textures look the same every time
const noise = (x: number, y: number, seed = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

// Pick a speckle color: light, dark or base, by noise value
const speckle = (n: number, light: string, dark: string, base: string) => {
  if (n > 0.9) return light;
  if (n < 0.1) return dark;
  return base;
};

const buildingPalettes = [
  { dark: '#4a5566', light: '#8795a8', mid: '#687588' }, // concrete
  { dark: '#5b2f26', light: '#a0594a', mid: '#7c4234' } // brick
];

const windowColors: Record<TimeOfDay, (lit: boolean) => string> = {
  evening: (lit) => (lit ? '#f2c46d' : '#3b3a5c'),
  morning: () => '#9fd4f0',
  night: (lit) => (lit ? '#ffd86b' : '#1d2433')
};

/** A building facade: outline, shaded wall, rooftop ledge and a grid of windows. */
function buildingTexture(heightPx: number, seed: number, timeOfDay: TimeOfDay) {
  const width = 30;
  const palette = buildingPalettes[seed % buildingPalettes.length];
  return pixelTexture(width, heightPx, (px) => {
    for (let y = 0; y < heightPx; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let color = palette.mid;
        if (x <= 2) color = palette.light; // lit edge
        if (x >= width - 3) color = palette.dark; // shaded edge
        if (y < 3) color = palette.light; // rooftop ledge
        if (y === 3) color = palette.dark;
        if (noise(x, y, seed) > 0.93) color = palette.dark; // grit
        if (x === 0 || x === width - 1 || y === 0) color = '#000000'; // outline
        px(x, y, color);
      }
    }
    // Windows: 4 x 5 pixels, each outlined in black, on an even grid
    for (let wy = 7; wy + 6 < heightPx - 4; wy += 9) {
      for (let wx = 4; wx + 5 < width - 3; wx += 7) {
        const lit = noise(wx, wy, seed + 1) > 0.45;
        for (let y = -1; y <= 5; y += 1) {
          for (let x = -1; x <= 4; x += 1) {
            const edge = y === -1 || y === 5 || x === -1 || x === 4;
            px(wx + x, wy + y, edge ? '#000000' : windowColors[timeOfDay](lit));
          }
        }
        if (timeOfDay === 'morning') px(wx, wy, '#ffffff'); // glint
      }
    }
  });
}

const asphaltTexture = (repeat: [number, number]) =>
  pixelTexture(
    32,
    32,
    (px) => {
      for (let y = 0; y < 32; y += 1) {
        for (let x = 0; x < 32; x += 1) px(x, y, speckle(noise(x, y, 3), '#4a4a55', '#2c2c34', '#3b3b44'));
      }
    },
    repeat
  );

const sidewalkTexture = (repeat: [number, number]) =>
  pixelTexture(
    16,
    16,
    (px) => {
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          const seam = x === 15 || y === 15;
          px(x, y, seam ? '#5c5c66' : speckle(noise(x, y, 5), '#8a8a94', '#7a7a84', '#7a7a84'));
        }
      }
    },
    repeat
  );

const laneTexture = (repeat: [number, number]) =>
  pixelTexture(
    20,
    2,
    (px) => {
      for (let x = 0; x < 20; x += 1) {
        for (let y = 0; y < 2; y += 1) px(x, y, x < 10 ? '#e8e0b0' : '#3b3b44');
      }
    },
    repeat
  );

/** Red warning circle, dithered so it reads as pixel art. */
const dangerTexture = () =>
  pixelTexture(32, 32, (px) => {
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const d = Math.hypot(x - 15.5, y - 15.5);
        if (d <= 16 && d > 14.5) px(x, y, '#ff2a2a');
        else if (d <= 14.5 && (x + y) % 2 === 0) px(x, y, '#c01818');
      }
    }
  });

type Props = {
  timeOfDay: TimeOfDay;
  buildings: Building[];
  dangerZones: [number, number, number][];
};

const STREET_WIDTH = 80;

/**
 * Sky, street and the city layout from Jarvis, all as flat pixel art.
 * Coordinates are on the ground plane (see toGround).
 */
export function Environment({ timeOfDay, buildings, dangerZones }: Props) {
  const street = useMemo(
    () => ({
      asphalt: asphaltTexture([STREET_WIDTH / (32 * PX), 20 / (32 * PX)]),
      danger: dangerTexture(),
      lane: laneTexture([STREET_WIDTH / (20 * PX), 1]),
      sidewalk: sidewalkTexture([STREET_WIDTH / (16 * PX), 4 / (16 * PX)])
    }),
    []
  );
  const facades = useMemo(
    () => buildings.map((b, i) => buildingTexture(Math.round(b.height / PX), i, timeOfDay)),
    [buildings, timeOfDay]
  );
  useEffect(() => () => facades.forEach((t) => t.dispose()), [facades]);

  return (
    <>
      {/* Background sky */}
      <color attach="background" args={[skyColors[timeOfDay]]} />

      {/* Sidewalk along the buildings, road in front */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -3]}>
        <planeGeometry args={[STREET_WIDTH, 4]} />
        <meshBasicMaterial map={street.sidewalk} color={streetTint[timeOfDay]} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 9]}>
        <planeGeometry args={[STREET_WIDTH, 20]} />
        <meshBasicMaterial map={street.asphalt} color={streetTint[timeOfDay]} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 3]}>
        <planeGeometry args={[STREET_WIDTH, 2 * PX]} />
        <meshBasicMaterial map={street.lane} color={streetTint[timeOfDay]} toneMapped={false} />
      </mesh>

      {/* Buildings */}
      {buildings.map((b, i) => {
        const [x, z] = toGround(b.x, b.y);
        return (
          <mesh key={`${b.x},${b.y}`} position={[x, b.height / 2, z]}>
            <planeGeometry args={[3, b.height]} />
            <meshBasicMaterial map={facades[i]} toneMapped={false} />
          </mesh>
        );
      })}

      {/* Danger zones on the ground */}
      {dangerZones.map(([x, y, radius]) => (
        <mesh key={`${x},${y}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, toGround(x, y)[1]]}>
          <planeGeometry args={[radius * 2, radius * 2]} />
          <meshBasicMaterial map={street.danger} transparent opacity={0.6} alphaTest={0.1} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
