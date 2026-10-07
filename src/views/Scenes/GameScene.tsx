import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { KeyboardControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';

import ButtonSfx, { menuSfx } from '../../components/ButtonSfx/ButtonSfx';
import { FireBreath, FlamePath, FlameTrail } from '../../components/Effects';
import { EmberChat } from '../../components/EmberChat';
import { Environment } from '../../components/Environment';
import { Fireball } from '../../components/Fireball';
import { Ninja } from '../../components/Ninja';
import { keyMap } from '../../config/controls';
import { autoAssist } from '../../game/ember';
import { endingTime, LANTERN, lightWave, LINES, resetEnding, silhouette, startEnding, T } from '../../game/ending';
import { checkHints, resetHints } from '../../game/hints';
import {
  burnFrontX,
  FINISH_X,
  flamePathState,
  inDark,
  inWind,
  level,
  LEVEL_WIDTH,
  resetLevel,
  SHAKE_TIME,
  triggeredFor,
  vineDeck,
  widthOf
} from '../../game/level';
import { music, play, wind } from '../../game/sound';
import { resetWorld, world } from '../../game/world';
import PauseMenu from '../Menus/PauseMenu';

const gameKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp']);
const VIEW_HEIGHT = 7; // world units visible top to bottom (the art's own scale)
const WIDE_VIEW = 16; // pulled back over the city while the paths light up
const CLOSING_VIEW = 9; // the closing silhouette shot

/**
 * Flat 2D camera that follows the ninja along the level and up onto higher
 * platforms, without showing past either end of the level. In the ending it frames the
 * lantern, pulls back to follow the light running along the paths, then comes back.
 */
function CameraRig() {
  const { camera, size } = useThree();
  const placed = useRef(false);
  const view = useRef(VIEW_HEIGHT);

  useFrame((_, delta) => {
    const ortho = camera as unknown as { zoom: number; updateProjectionMatrix: () => void };
    const since = endingTime(world.time);
    let viewHeight = VIEW_HEIGHT;
    let targetX = world.player.x;
    let targetY = world.player.y + 1.2;
    let speed = 5;
    if (since !== null) {
      speed = 2.5;
      targetY = world.player.y + 2.4; // room above for the lantern
      if (since >= T.pullOut && since < T.pullIn) {
        viewHeight = WIDE_VIEW;
        targetX = LANTERN.x - lightWave(since) * LANTERN.x;
        targetY = 4;
      }
      if (since >= T.silhouette) {
        // The closing shot: a little wider and lower, so the rooftop sits above the end card
        viewHeight = CLOSING_VIEW;
        targetY = world.player.y + 1.6;
      }
    }
    const k = placed.current ? 1 - Math.exp(-speed * delta) : 1; // start in place, then follow smoothly
    placed.current = true;
    view.current += (viewHeight - view.current) * k;
    ortho.zoom = size.height / view.current;
    ortho.updateProjectionMatrix();
    const halfW = size.width / ortho.zoom / 2;
    targetX = Math.min(Math.max(targetX, halfW), Math.max(halfW, LEVEL_WIDTH - halfW));
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
    if (world.paused || endingTime(world.time) !== null) return;
    checkHints();
    autoAssist();
  });
  return null;
}

/**
 * Starts the ending once the ninja lands on the highest rooftop, gives Ember its lines,
 * darkens everything to silhouettes at the close, and tells the page when to show the end card.
 */
function EndingDirector({ onCard }: { onCard: () => void }) {
  const said = useRef(new Set<string>());
  const carded = useRef(false);
  useFrame(() => {
    if (world.paused) return;
    if (endingTime(world.time) === null && world.player.x >= FINISH_X && world.grounded) startEnding(world.time);
    const since = endingTime(world.time);
    if (since === null) return;
    LINES.forEach((line) => {
      if (line.who !== 'ember' || since < line.at || said.current.has(line.text)) return;
      said.current.add(line.text);
      world.ember.reply = line.text;
      world.ember.replyUntil = world.time + line.time;
    });
    world.shade = silhouette(since);
    if (!carded.current && since >= T.card) {
      carded.current = true;
      onCard();
    }
  });
  return null;
}

/**
 * The game's sounds for things happening in the world: crumbling and moving blocks,
 * Ember speaking and using its fire, the wind on the vine bridge, the music, and the
 * lantern's swell at the end. (The ninja's own jumps and landings are in Ninja.)
 */
function SoundWatcher() {
  const seen = useRef({
    burnUntil: 0,
    dark: false,
    ending: false,
    flame: false,
    ignited: false,
    legs: new Map<number, number>(),
    lightUntil: 0,
    pushUntil: 0,
    replyUntil: 0,
    triggered: new Map<number, number | null>()
  });
  useEffect(
    () => () => {
      music.fadeTo(0, 0.4);
      wind.fadeTo(0, 0.4);
    },
    []
  );
  useFrame(() => {
    const was = seen.current;
    const now = world.time;
    const since = endingTime(now);
    // Music and wind (quieter while paused or talking to Ember)
    let musicVolume = world.paused ? 0.12 : 0.3;
    if (since !== null) musicVolume = 0.12;
    music.fadeTo(musicVolume, 1);
    let windVolume = 0;
    if (inWind(world.player.x) && since === null) windVolume = world.paused ? 0.15 : 0.45;
    wind.fadeTo(windVolume, 0.8);
    if (world.paused) return;

    level.forEach((piece) => {
      const kind = piece.motion?.kind;
      const near = Math.abs(piece.x + widthOf(piece) / 2 - world.player.x);
      const loud = Math.max(0, 1 - near / 9);
      // Crumbling blocks crack and rumble when landed on, then crumble as they drop; false platforms crack apart
      if (kind === 'fall' || kind === 'false') {
        const t = triggeredFor(piece, now);
        const before = was.triggered.get(piece.id) ?? null;
        if (t !== null && before === null) {
          play('block-crack', { rate: kind === 'false' ? 1.3 : 1, volume: 0.6 });
          if (kind === 'fall') play('block-rumble', { volume: 0.5 });
          else play('block-crumble', { rate: 1.4, volume: 0.35 });
        }
        if (kind === 'fall' && t !== null && t >= SHAKE_TIME && (before === null || before < SHAKE_TIME)) {
          play('block-crumble', { volume: 0.55 });
        }
        was.triggered.set(piece.id, t);
      }
      // Moving blocks slide each time they set off in a new direction, if he is close enough to hear
      if (piece.motion?.kind === 'drift') {
        const leg = Math.floor(now / (piece.motion.period / 2));
        if (was.legs.has(piece.id) && was.legs.get(piece.id) !== leg && loud > 0) {
          play('block-slide', { volume: 0.3 * loud });
        }
        was.legs.set(piece.id, leg);
      }
    });

    const { ember } = world;
    // A small warm chime each time Ember starts saying something
    if (ember.replyUntil > was.replyUntil && ember.replyUntil > now && ember.reply)
      play('ember-chime', { volume: 0.4 });
    // Ember lights the area (asked to, or as he walks into the dark stretch)
    const dark = inDark(world.player.x);
    if (ember.lightUntil > was.lightUntil || (dark && !was.dark)) play('ember-glow', { volume: 0.45 });
    // Ember's fire: burning the vines, carrying him to a ledge, drawing the flame path
    if (ember.burnUntil > was.burnUntil) {
      play('fire-burst', { volume: 0.6 });
      play('fire-crackle', { rate: 0.8, volume: 0.8 });
    }
    if (ember.pushUntil > was.pushUntil) play('fire-whoosh', { volume: 0.6 });
    const flame = flamePathState(now).started;
    if (flame && !was.flame) {
      play('fire-whoosh', { rate: 0.8, volume: 0.7 });
      play('fire-crackle', { rate: 0.7, volume: 0.5 });
    }
    // The ending: the lantern lights with a long warm swell
    const ignited = since !== null && since >= T.ignite;
    if (ignited && !was.ignited) play('beacon', { volume: 0.9 });

    Object.assign(was, {
      burnUntil: ember.burnUntil,
      dark,
      ending: since !== null,
      flame,
      ignited,
      lightUntil: ember.lightUntil,
      pushUntil: ember.pushUntil,
      replyUntil: ember.replyUntil
    });
  });
  return null;
}

/** The close: "The journey continues..." in a gold frame, and the end buttons. */
function EndCard({ onReplay }: { onReplay: () => void }) {
  const [comingSoon, setComingSoon] = useState(false);
  return (
    <motion.div
      className="fixed inset-x-0 bottom-10 z-40 flex flex-col items-center gap-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5 }}
    >
      <div className="flex w-full items-center justify-center">
        <div className="h-[3px] w-24 bg-amber-400" />
        <div className="border-[3px] border-amber-400 bg-[#120f1a] px-8 py-4 font-pixel text-sm text-amber-200 shadow-[0_0_0_3px_#000]">
          THE JOURNEY CONTINUES...
        </div>
        <div className="h-[3px] w-24 bg-amber-400" />
      </div>
      <div className="flex gap-10 border-2 border-black bg-black/60 px-6">
        <ButtonSfx sfxUrl={menuSfx} buttonLabel="Replay Journey" onClick={onReplay} />
        <ButtonSfx sfxUrl={menuSfx} buttonLabel="Explore New Rooftops" onClick={() => setComingSoon(true)} />
      </div>
      {comingSoon && (
        <div className="font-pixel text-[10px] text-amber-100 [text-shadow:2px_2px_0_#000]">
          New rooftops are on the way!
        </div>
      )}
    </motion.div>
  );
}

export default function GameScene() {
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [journey, setJourney] = useState(0); // each replay starts the whole scene over

  // Every game starts fresh: falling blocks back in place, Ember's abilities ready
  useEffect(() => {
    resetLevel();
    resetWorld();
    resetHints();
    resetEnding();
  }, [journey]);

  const replay = () => {
    setEnded(false);
    setJourney((j) => j + 1);
  };

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
      if ((e.key === 't' || e.key === 'T') && !paused && endingTime(world.time) === null) {
        e.preventDefault(); // don't type the T into the chat box
        play('chat-open', { volume: 0.5 });
        setChatting(true);
      }
    };

    //window.addEventListener('keydown', toggleAI);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatting, paused]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <KeyboardControls map={keyMap}>
        {/* rotation set so the camera faces straight ahead (by default it would turn toward the origin) */}
        <Canvas key={journey} orthographic camera={{ position: [3, 1.2, 100], rotation: [0, 0, 0], zoom: 100 }}>
          <GameClock />
          <Environment />
          <FlameTrail />
          <FlamePath />
          <Fireball />
          <FireBreath target={() => [burnFrontX(world.time) + 0.3, vineDeck + 0.4]} />
          <Ninja />
          <CameraRig />
          <HintWatcher />
          <EndingDirector onCard={() => setEnded(true)} />
          <SoundWatcher />
        </Canvas>
      </KeyboardControls>

      {ended && <EndCard onReplay={replay} />}

      {chatting && <EmberChat onClose={() => setChatting(false)} />}
      {paused && <PauseMenu onCloseMenu={() => setPaused(false)} />}
    </div>
  );
}
