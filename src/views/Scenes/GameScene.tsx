import React, { useEffect, useRef, useState } from 'react';

import { KeyboardControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';

import { FireBreath, FlameTrail } from '../../components/Effects';
import { EmberChat } from '../../components/EmberChat';
import { Environment } from '../../components/Environment';
import { Fireball } from '../../components/Fireball';
import { Ninja } from '../../components/Ninja';
import { keyMap } from '../../config/controls';
import { autoAssist } from '../../game/ember';
import { checkHints, resetHints } from '../../game/hints';
import { FINISH_X, LEVEL_WIDTH, resetLevel, VINE_WALL, vineWallBase } from '../../game/level';
import { resetWorld, world } from '../../game/world';
import PauseMenu from '../Menus/PauseMenu';

const gameKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp']);
const VIEW_HEIGHT = 7; // world units visible top to bottom (the art's own scale)

/**
 * Flat 2D camera that follows the ninja along the level and up onto higher
 * platforms, without showing past either end of the level.
 */
function CameraRig() {
  const { camera, size } = useThree();
  const placed = useRef(false);
  useEffect(() => {
    const ortho = camera as unknown as { zoom: number; updateProjectionMatrix: () => void };
    ortho.zoom = size.height / VIEW_HEIGHT;
    ortho.updateProjectionMatrix();
  }, [camera, size]);

  useFrame((_, delta) => {
    const halfW = size.width / (size.height / VIEW_HEIGHT) / 2;
    const k = placed.current ? 1 - Math.exp(-5 * delta) : 1; // start in place, then follow smoothly
    placed.current = true;
    const targetX = Math.min(Math.max(world.player.x, halfW), Math.max(halfW, LEVEL_WIDTH - halfW));
    const targetY = world.player.y + 1.2;
    camera.position.x += (targetX - camera.position.x) * k;
    camera.position.y += (targetY - camera.position.y) * k;
  });
  return null;
}

/** Runs the game clock, which stops while paused or talking to Ember. */
function GameClock() {
  useFrame((_, delta) => {
    if (!world.paused) world.time += Math.min(delta, 1 / 30);
  });
  return null;
}

/** Lets Ember call out each challenge as the ninja reaches it, and step in to help. */
function HintWatcher() {
  useFrame(() => {
    if (world.paused) return;
    checkHints();
    autoAssist();
  });
  return null;
}

/** Tells the page once the ninja reaches the far rooftop. */
function FinishWatcher({ onFinish }: { onFinish: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (!done.current && world.player.x >= FINISH_X) {
      done.current = true;
      onFinish();
    }
  });
  return null;
}

export default function GameScene() {
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [chatting, setChatting] = useState(false);

  // Every game starts fresh: falling blocks back in place, Ember's abilities ready
  useEffect(() => {
    resetLevel();
    resetWorld();
    resetHints();
  }, []);

  // The world stands still while the pause menu or the chat is open
  useEffect(() => {
    world.paused = paused || chatting;
  }, [paused, chatting]);

  // Keys while playing (the chat box handles its own keys while it is open)
  useEffect(() => {
    if (chatting) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameKeys.has(e.key)) {
        // Stop the arrows from scrolling the page or pressing a focused button
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
      }
      if (e.key === 'Escape') setPaused((p) => !p);
      if ((e.key === 't' || e.key === 'T') && !paused) {
        e.preventDefault(); // don't type the T into the chat box
        setChatting(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatting, paused]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <KeyboardControls map={keyMap}>
        {/* rotation set so the camera faces straight ahead (by default it would turn toward the origin) */}
        <Canvas orthographic camera={{ position: [3, 1.2, 100], rotation: [0, 0, 0], zoom: 100 }}>
          <GameClock />
          <Environment />
          <FlameTrail />
          <Fireball />
          <FireBreath target={[VINE_WALL.x + VINE_WALL.width / 2, vineWallBase() + VINE_WALL.height * 0.45]} />
          <Ninja />
          <CameraRig />
          <HintWatcher />
          <FinishWatcher onFinish={() => setFinished(true)} />
        </Canvas>
      </KeyboardControls>

      {finished && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 border-2 border-white bg-black/70 px-6 py-4 font-pixel text-xs text-amber-300">
          You crossed the city!
        </div>
      )}

      {chatting && <EmberChat onClose={() => setChatting(false)} />}
      {paused && <PauseMenu onCloseMenu={() => setPaused(false)} />}
    </div>
  );
}
