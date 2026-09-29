import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Group } from 'three';

import { Html, useKeyboardControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

export type Suit = 'normal' | 'jarvis';

interface CharacterProps {
  suit: Suit;
  position: [number, number, number];
}

const MOVE_SPEED = 4;

// Pixel-art grid (12 wide x 15 tall). Each char is a voxel color key:
//   R = suit color, B = accent color, W = white, '.' = empty.
const GRID = [
  '...RRRRRR...',
  '...RWRRWR...',
  '...RWRRWR...',
  '...RRRRRR...',
  '...RRRRRR...',
  '....RRRR....',
  'RR.RRBBRR.RR',
  'RR.RRBBRR.RR',
  'RR.RRRRRR.RR',
  'RR.RRRRRR.RR',
  'BB.RRRRRR.BB',
  '....RRRR....',
  '...RR..RR...',
  '...RR..RR...',
  '...BB..BB...'
];

const VOXEL = 0.3;

type Voxel = { x: number; y: number; k: 'R' | 'B' | 'W' };

// Build the flat voxel list once from the grid, centered on the grid.
const buildVoxels = (): Voxel[] => {
  const out: Voxel[] = [];
  GRID.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const k = row[c];
      if (k === '.') continue;
      out.push({ x: (c - 5.5) * VOXEL, y: (14 - r) * VOXEL, k: k as 'R' | 'B' | 'W' });
    }
  });
  return out;
};

/**
 * Pixel-art (voxel) Spiderman built from small cubes so it reads as a
 * blocky low-poly character instead of smooth 3d blobs. All voxels are
 * positioned relative to the character group so WASD moves the whole sprite.
 */
export function ChibiSpiderman({ position, suit }: CharacterProps) {
  const ref = useRef<Group>(null);
  const [, getKeys] = useKeyboardControls();
  const [isCharging, setIsCharging] = useState(false);
  const [chargeLevel, setChargeLevel] = useState(100);
  const voxels = useMemo(buildVoxels, []);

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

  useFrame((_, delta) => {
    if (!ref.current || isCharging) return;
    const { backward, forward, left, right } = getKeys();
    const step = MOVE_SPEED * delta;
    if (forward) ref.current.position.z -= step;
    if (backward) ref.current.position.z += step;
    if (left) ref.current.position.x -= step;
    if (right) ref.current.position.x += step;
  });

  // Wings are out while he has enough charge to fly
  const flying = !isCharging && chargeLevel >= 50;

  // Determine colors based on suit
  const suitColor = suit === 'normal' ? '#ff0000' : '#111111'; // red vs dark
  const accentColor = suit === 'normal' ? '#0000ff' : '#ffd700'; // blue vs gold
  const colorFor = (k: 'R' | 'B' | 'W') => (k === 'R' ? suitColor : k === 'B' ? accentColor : 'white');

  return (
    <group ref={ref} position={position}>
      {/* Pixel-art body: one cube per grid cell */}
      {voxels.map((v, i) => (
        <mesh key={i} position={[v.x, v.y, 0]} scale={[VOXEL, VOXEL, VOXEL * 1.6]}>
          <boxGeometry />
          <meshStandardMaterial color={colorFor(v.k)} />
        </mesh>
      ))}

      {/* Bat-like wings (out while flying) */}
      {flying && (
        <group position={[0, 2.4, -0.4]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 1.1, 0, 0]} rotation={[0, 0, side * 0.3]} scale={[1.5, 0.1, 0.7]}>
              <boxGeometry />
              <meshStandardMaterial color={accentColor} transparent opacity={0.7} />
            </mesh>
          ))}
        </group>
      )}

      {/* Jarvis robot companion (small glowing cube) */}
      {suit === 'jarvis' && (
        <mesh position={[1.1, 3.4, 0]} scale={[0.4, 0.4, 0.4]}>
          <boxGeometry />
          <meshStandardMaterial color="gold" emissive="gold" emissiveIntensity={0.3} />
        </mesh>
      )}

      {/* Charging pod (white glowing cube) while recharging */}
      {isCharging && (
        <mesh position={[1.4, 0.4, 0]} scale={[0.5, 0.5, 0.5]}>
          <boxGeometry />
          <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* UI overlay for charging status */}
      <Html position={[0, 4.7, 0]} center>
        <div
          style={{
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '4px',
            color: 'white',
            padding: '2px 6px',
            whiteSpace: 'nowrap'
          }}
        >
          {isCharging ? 'Charging' : 'Charge'}: {chargeLevel}%
        </div>
      </Html>
    </group>
  );
}