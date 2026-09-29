import React from 'react';

import { Building } from '../types/jarvis';

export type TimeOfDay = 'morning' | 'evening' | 'night';

const skyColors: Record<TimeOfDay, string> = {
  morning: '#87ceeb', // light sky blue
  evening: '#4b0082', // indigo
  night: '#0b0b0b' // near black
};

const sunIntensity: Record<TimeOfDay, number> = {
  morning: 1.2,
  evening: 0.6,
  night: 0.15
};

type Props = {
  timeOfDay: TimeOfDay;
  buildings: Building[];
  dangerZones: [number, number, number][];
};

/**
 * Sky, lighting, ground and the city layout using Three.js with pixel art style.
 * Coordinates are on the ground plane: x maps to x, y maps to z.
 */
export function Environment({ timeOfDay, buildings, dangerZones }: Props) {
  const skyGradient =
    timeOfDay === 'morning'
      ? 'linear-gradient(180deg, #87ceeb 0%, #2c3e50 100%)'
      : timeOfDay === 'evening'
      ? 'linear-gradient(180deg, #4b0082 0%, #1a1a2e 100%)'
      : 'linear-gradient(180deg, #0b0b0b 0%, #1a0a0a 100%)';

  return (
    <>
      {/* Background sky */}
      <color attach="background" args={[skyColors[timeOfDay]] } />

      <ambientLight intensity={0.3} />

      <directionalLight position={[10, 20, 10]} intensity={sunIntensity[timeOfDay]} />

      {/* Street - pixel art ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>

      {/* Buildings - flat planes with pixel art textures/colors */}
      {buildings.map((b) => (
        <mesh key={`${b.x},${b.y}`} position={[b.x, b.height / 2, -b.y - 4]}>
          <planeGeometry args={[3, b.height]} />
          <meshStandardMaterial color={b.height > 15 ? '#5a6b7c' : '#7a8c9e'} />
        </mesh>
      ))}

      {/* Danger zones - flat red circles on the ground */}
      {dangerZones.map(([x, y, radius]) => (
        <mesh key={`${x},${y}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -y - 4]}>
          <planeGeometry args={[radius, 32]} />
          <meshBasicMaterial color="red" transparent opacity={0.2} />
        </mesh>
      ))}
    </>
  );
}