import React, { useEffect, useRef, useState } from 'react';
import { Group } from 'three';

import { Html, useKeyboardControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

export type Suit = 'normal' | 'jarvis';

interface CharacterProps {
  suit: Suit;
  position: [number, number, number];
}

const MOVE_SPEED = 4;

/**
 * Simple chibi Spiderman character using primitive shapes.
 * All parts are positioned relative to the character, so the whole
 * group moves together. WASD moves him around the street.
 */
export function ChibiSpiderman({ position, suit }: CharacterProps) {
  const ref = useRef<Group>(null);
  const [, getKeys] = useKeyboardControls();
  const [isCharging, setIsCharging] = useState(false);
  const [chargeLevel, setChargeLevel] = useState(100);

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

  return (
    <group ref={ref} position={position}>
      {/* Body */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color={suitColor} />
      </mesh>

      {/* Head (chibi proportions: big head) */}
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshStandardMaterial color={suitColor} />
      </mesh>

      {/* Eyes */}
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} position={[x, 1.38, 0.38]}>
          <sphereGeometry args={[0.1, 8, 8]} />
          <meshStandardMaterial color="white" />
        </mesh>
      ))}

      {/* Web pattern (chest band) */}
      <mesh position={[0, 0.55, 0.42]}>
        <boxGeometry args={[0.8, 0.08, 0.1]} />
        <meshStandardMaterial color={accentColor} transparent opacity={0.6} />
      </mesh>

      {/* Claws (2 per hand) */}
      {[-0.6, 0.6].map((x) =>
        [-0.06, 0.06].map((z) => (
          <mesh key={`${x},${z}`} position={[x, 0.4, z]} scale={[0.08, 0.25, 0.08]}>
            <boxGeometry />
            <meshStandardMaterial color={accentColor} />
          </mesh>
        ))
      )}

      {/* Bat-like wings (out while flying) */}
      {flying && (
        <group position={[0, 0.8, -0.4]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.9, 0, 0]} rotation={[0, 0, side * 0.3]}>
              <boxGeometry args={[1.4, 0.05, 0.6]} />
              <meshStandardMaterial color={accentColor} transparent opacity={0.7} />
            </mesh>
          ))}
        </group>
      )}

      {/* Jarvis robot companion (small cube) */}
      {suit === 'jarvis' && (
        <mesh position={[0.9, 1.6, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="gold" emissive="gold" emissiveIntensity={0.3} />
        </mesh>
      )}

      {/* Charging pod (white glowing cube) while recharging */}
      {isCharging && (
        <mesh position={[1.2, 0.2, 0]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* UI overlay for charging status */}
      <Html position={[0, 2.1, 0]} center>
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
