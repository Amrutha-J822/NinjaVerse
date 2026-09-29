import React, { useEffect, useState, useRef } from 'react';

import { useNavigate } from 'react-router-dom';

import { JarvisDecision, Level } from '../../types/jarvis';

import { KeyboardControls, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';

import { ChibiSpiderman, Suit } from '../../components/Characters';
import { Environment, TimeOfDay } from '../../components/Environment';
import PauseMenu from '../Menus/PauseMenu';

const keyMap = [
  { name: 'forward', keys: ['w', 'W', 'ArrowUp'] },
  { name: 'backward', keys: ['s', 'S', 'ArrowDown'] },
  { name: 'left', keys: ['a', 'A', 'ArrowLeft'] },
  { name: 'right', keys: ['d', 'D', 'ArrowRight'] },
  { name: 'jump', keys: [' ', 'ArrowUp'] }
];

const timeIcons: Record<TimeOfDay, string> = { evening: '🌇', morning: '☀️', night: '🌙' };

type Props = {
  decision: JarvisDecision;
  level: Level;
};

export default function GameScene({ decision, level }: Props) {
  const navigate = useNavigate();
  const [paused, setPaused] = useState(false);
  const [suit, setSuit] = useState<Suit>('normal');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning');
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  // Endless runner platforms (buildings)
  const [platforms, setPlatforms] = useState<{ id: number; x: number; height: number; width: number; passed: boolean }[]>(() => {
    const initial: { id: number; x: number; height: number; width: number; passed: boolean }[] = [];
    // Generate initial buildings from decision
    decision.buildings.forEach((b) => {
      initial.push({
        id: 0,
        x: b.x * 10,
        height: b.height,
        width: 32,
        passed: false
      });
    });
    return initial;
  });

  const platformRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaused((p) => !p);
      if (e.key === 'j' || e.key === 'J') setSuit((s) => (s === 'normal' ? 'jarvis' : 'normal'));
      // Jump on space or ArrowUp
      if ((e.key === ' ' || e.key === 'ArrowUp') && !gameOver) {
        setScore((prev) => prev + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver]);

  // Generate new platforms continuously
  useEffect(() => {
    if (gameOver) return;

    const spawnPlatform = setInterval(() => {
      const lastPlatform = platforms[platforms.length - 1];
      const newX = lastPlatform.x + 20 + Math.random() * 20;
      const newHeight = 8 + Math.floor(Math.random() * 12);
      
      setPlatforms((prev) => [
        ...prev,
        {
          id: Date.now(),
          x: newX,
          height: newHeight,
          width: 32,
          passed: false
        }
      ]);
    }, 1000);

    return () => clearInterval(spawnPlatform);
  }, [platforms, gameOver]);

  // Check collisions and remove off-screen platforms
  useEffect(() => {
    if (gameOver) return;

    const checkCollisions = setInterval(() => {
      const playerY = 0; // Simplified - would check actual position
      
      setPlatforms((prev) => prev.map((platform) => {
        // Check if platform went off screen (passed player)
        if (platform.x + platform.width < 0) {
          // Check if player jumped over it
          const wasPassed = !platform.passed;
          return { ...platform, passed: true, x: platform.x - 20 };
        }
        return platform;
      }));
    }, 50);

    return () => clearInterval(checkCollisions);
  }, [gameOver]);

  if (gameOver) {
    return (
      <div className="relative min-h-screen w-screen bg-black flex flex-col items-center justify-center">
        <div className="bg-black/80 p-8 rounded-lg text-center text-white">
          <div className="text-4xl font-bold mb-4">GAME OVER</div>
          <div className="text-2xl mb-2">Score: {score}</div>
          <button
            className="mt-4 px-6 py-2 bg-teal-600 text-white rounded"
            onClick={() => setGameOver(false)}
          >
            Restart
          </button>
          <button
            className="mt-2 px-6 py-2 bg-gray-600 text-white rounded"
            onClick={() => navigate('/main-menu')}
          >
            Main Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-black overflow-hidden">
      <KeyboardControls map={keyMap}>
        <Canvas camera={{ fov: 50, position: [0, 8, 18] }}>
          <Environment timeOfDay={timeOfDay} 
            buildings={decision.buildings} 
            dangerZones={decision.danger_zone} />
          <ChibiSpiderman suit={suit} position={[0, 0, 6]} />
          <OrbitControls target={[0, 2, 0]} maxPolarAngle={Math.PI / 2.1} />
        </Canvas>
      </KeyboardControls>

      {/* Arcade HUD */}
      <div className="pointer-events-none fixed top-2 left-2 bg-black/80 backdrop-blur-sm p-3 rounded text-white text-sm font-mono">
        <div className="flex items-center gap-2">
          <div>Score: {score}</div>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div>Level: {level}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {(['normal', 'jarvis'] as Suit[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSuit(s)}
            className={`rounded px-3 py-1 font-mono text-sm text-white ${suit === s ? 'bg-red-700' : 'bg-black/60'}`}
          >
            {s === 'normal' ? 'Normal' : 'Jarvis'}
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