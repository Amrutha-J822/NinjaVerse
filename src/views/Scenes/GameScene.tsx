import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { KeyboardControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';

import { ChibiSpiderman, Suit } from '../../components/Characters';
import { buildingTop, Environment, TimeOfDay } from '../../components/Environment';
import { Venom } from '../../components/Venom';
import { controlHints, keyMap } from '../../config/controls';
import { world } from '../../game/world';
import { JarvisDecision, Level } from '../../types/jarvis';
import PauseMenu from '../Menus/PauseMenu';

const gameKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);

type Platform = { id: number; x: number; height: number; width: number; passed: boolean };

const PLATFORM_WIDTH = 32;
const SPAWN_HORIZON = 200;

/**
 * Side-on camera, like a classic 2D beat-'em-up: it follows Spider-Man (including up onto
 * rooftops) from slightly above, looking straight along the street so the art stays flat.
 */
function CameraRig() {
  useFrame((state, delta) => {
    const { camera } = state;
    const p = world.player;
    const k = 1 - Math.exp(-4 * delta);
    camera.position.x += (p.x - camera.position.x) * k;
    camera.position.y += (p.y + 5 - camera.position.y) * k;
    camera.position.z += (p.z + 14 - camera.position.z) * k;
    camera.lookAt(camera.position.x, camera.position.y - 2.6, camera.position.z - 14);
  });
  return null;
}

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
  const webAnchors = useMemo(() => decision.buildings.map(buildingTop), [decision.buildings]);

  // Endless runner platforms (buildings), seeded from Jarvis's layout.
  // Kept in a ref, not state, so the 20 updates a second don't re-render the whole scene.
  // TODO: render platforms in the Canvas (read platforms.current in useFrame) and set gameOver on collision
  const platforms = useRef<Platform[]>(
    decision.buildings.map((b, i) => ({
      height: b.height,
      id: i,
      passed: false,
      width: PLATFORM_WIDTH,
      x: b.x * 10
    }))
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameKeys.has(e.key)) {
        // Stop arrows/space from scrolling the page or pressing a focused HUD button
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
      }
      if (e.key === 'Escape') setPaused((p) => !p);
      // Each jump scores a point
      if (e.key === ' ' && !e.repeat && !gameOver) {
        setScore((prev) => prev + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver]);

  // Generate new platforms continuously
  useEffect(() => {
    if (gameOver) return undefined;

    const spawnPlatform = setInterval(() => {
      const prev = platforms.current;
      const lastX = prev.length ? prev[prev.length - 1].x : 0;
      // Only keep a limited stretch of city ahead of the player
      if (lastX > SPAWN_HORIZON) return;
      prev.push({
        height: 8 + Math.floor(Math.random() * 12),
        id: Date.now(),
        passed: false,
        width: PLATFORM_WIDTH,
        x: lastX + 20 + Math.random() * 20
      });
    }, 1000);

    return () => clearInterval(spawnPlatform);
  }, [gameOver]);

  // Scroll platforms toward the player and remove the ones that went off screen
  useEffect(() => {
    if (gameOver) return undefined;

    const scroll = setInterval(() => {
      platforms.current = platforms.current
        .map((platform) => ({ ...platform, passed: platform.passed || platform.x < 0, x: platform.x - 1 }))
        .filter((platform) => platform.x + platform.width >= 0);
    }, 50);

    return () => clearInterval(scroll);
  }, [gameOver]);

  if (gameOver) {
    return (
      <div className="relative flex min-h-screen w-screen flex-col items-center justify-center bg-black font-pixel">
        <div className="border-4 border-white bg-black p-8 text-center text-white">
          <div className="mb-6 text-2xl text-red-500">GAME OVER</div>
          <div className="mb-4 text-sm">Score: {score}</div>
          <button
            className="mt-4 block w-full border-2 border-white bg-teal-700 px-6 py-3 text-xs text-white"
            onClick={() => {
              setScore(0);
              setGameOver(false);
            }}
          >
            Restart
          </button>
          <button
            className="mt-2 block w-full border-2 border-white bg-gray-700 px-6 py-3 text-xs text-white"
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
        <Canvas camera={{ fov: 50, position: [0, 5, 20] }}>
          <Environment timeOfDay={timeOfDay} buildings={decision.buildings} dangerZones={decision.danger_zone} />
          <ChibiSpiderman suit={suit} position={[0, 0, 6]} webAnchors={webAnchors} />
          {/* Venom only shows up on the hard level */}
          {level === 'hard' && <Venom start={[14, 0, 6]} />}
          <CameraRig />
        </Canvas>
      </KeyboardControls>

      {/* Arcade HUD */}
      <div className="pointer-events-none fixed left-2 top-2 border-2 border-white bg-black/80 p-3 font-pixel text-[10px] leading-5 text-white">
        <div className="flex items-center gap-2">
          <div>Score: {score}</div>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div>Level: {level}</div>
        </div>
        <div className="mt-2 text-[8px] leading-4 text-white/60">
          {controlHints.map((hint) => (
            <div key={hint}>{hint}</div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {(['normal', 'jarvis'] as Suit[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSuit(s)}
            className={`border-2 border-black px-3 py-2 font-pixel text-[10px] text-white ${
              suit === s ? 'bg-red-700' : 'bg-black/60'
            }`}
          >
            {s === 'normal' ? 'Normal' : 'Jarvis'}
          </button>
        ))}
        {(['morning', 'evening', 'night'] as TimeOfDay[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTimeOfDay(t)}
            className={`border-2 border-black px-3 py-2 font-pixel text-[10px] capitalize text-white ${
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
