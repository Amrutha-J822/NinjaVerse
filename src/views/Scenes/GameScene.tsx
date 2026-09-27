import React, { useEffect, useState } from 'react';

import { KeyboardControls, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';

import { ChibiSpiderman, Suit } from '../../components/Characters';
import { Environment, TimeOfDay } from '../../components/Environment';
import { JarvisDecision, Level } from '../../types/jarvis';
import PauseMenu from '../Menus/PauseMenu';

const keyMap = [
  { name: 'forward', keys: ['w', 'W', 'ArrowUp'] },
  { name: 'backward', keys: ['s', 'S', 'ArrowDown'] },
  { name: 'left', keys: ['a', 'A', 'ArrowLeft'] },
  { name: 'right', keys: ['d', 'D', 'ArrowRight'] }
];

const timeIcons: Record<TimeOfDay, string> = { evening: '🌇', morning: '☀️', night: '🌙' };

type Props = {
  decision: JarvisDecision;
  level: Level;
};

export default function GameScene({ decision, level }: Props) {
  const [paused, setPaused] = useState(false);
  const [suit, setSuit] = useState<Suit>('normal');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaused((p) => !p);
      // 'J' toggles the Jarvis suit
      if (e.key === 'j' || e.key === 'J') setSuit((s) => (s === 'normal' ? 'jarvis' : 'normal'));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <KeyboardControls map={keyMap}>
        <Canvas camera={{ fov: 50, position: [0, 8, 18] }}>
          <Environment timeOfDay={timeOfDay} buildings={decision.buildings} dangerZones={decision.danger_zone} />
          <ChibiSpiderman suit={suit} position={[0, 0, 6]} />
          <OrbitControls target={[0, 2, 0]} maxPolarAngle={Math.PI / 2.1} />
        </Canvas>
      </KeyboardControls>

      {/* HUD */}
      <div className="pointer-events-none absolute left-4 top-4 rounded bg-black/60 p-3 font-mono text-sm text-white">
        <div>Level: {level}</div>
        <div>Villain energy: {decision.villain_energy}</div>
        <div>Attack: {decision.attack}</div>
        <div>
          {timeOfDay} {timeIcons[timeOfDay]}
        </div>
        <div className="mt-2 text-white/60">WASD move · J suit · Esc pause</div>
      </div>

      {/* Suit and time-of-day controls */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {(['normal', 'jarvis'] as Suit[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSuit(s)}
            className={`rounded px-3 py-1 font-mono text-sm text-white ${suit === s ? 'bg-red-700' : 'bg-black/60'}`}
          >
            {s === 'normal' ? 'Normal Suit' : 'Jarvis Suit'}
          </button>
        ))}
        {(['morning', 'evening', 'night'] as TimeOfDay[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTimeOfDay(t)}
            className={`rounded px-3 py-1 font-mono text-sm capitalize text-white ${
              timeOfDay === t ? 'bg-teal-700' : 'bg-black/60'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {paused && <PauseMenu onCloseMenu={() => setPaused(false)} />}
    </div>
  );
}
