import React, { useMemo, useRef, useState } from 'react';
import { Group, ShaderMaterial } from 'three';

import { useFrame, useThree } from '@react-three/fiber';

import { backgroundArt } from '../game/art';
import {
  DARK_ZONE,
  level,
  LEVEL_WIDTH,
  Piece,
  pieceState,
  PX,
  triggeredFor,
  VINE_WALL,
  vineWallBase,
  widthOf
} from '../game/level';
import { world } from '../game/world';

import { Debris, Glow, VineWall, Wind } from './Effects';
import { GameSprite } from './GameSprite';

const background = { ...backgroundArt, originX: backgroundArt.width / 2 };

/**
 * The night city behind everything. It stays with the camera, scaled to cover the
 * view, and slides a little as the ninja travels so it feels far away.
 */
function Background() {
  const ref = useRef<Group>(null);
  const { camera, size } = useThree();

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const zoom = (camera as unknown as { zoom: number }).zoom || 1;
    const viewW = size.width / zoom;
    const viewH = size.height / zoom;
    const scale = Math.max(viewW / (background.width * PX), viewH / (background.height * PX));
    const spare = background.width * PX * scale - viewW; // extra width to slide across
    const progress = Math.min(1, Math.max(0, world.player.x / LEVEL_WIDTH));
    group.scale.setScalar(scale);
    group.position.set(camera.position.x + spare * (0.5 - progress), camera.position.y, -50);
  });

  return (
    <group ref={ref}>
      <GameSprite art={background} anchor="center" />
    </group>
  );
}

const REVEAL_RADIUS = 3.2; // a false platform glows red once Ember's light is this close

/**
 * One platform, drawn where it is right now (moving, shaking, dropping or gone).
 * Checkpoint blocks glow gold. Crumbling blocks shed bits of stone as they go.
 * False platforms look normal until Ember's light reaches them, then glow red.
 */
function LevelPiece({ piece }: { piece: Piece }) {
  const ref = useRef<Group>(null);
  const [revealed, setRevealed] = useState(false);
  const revealedRef = useRef(false);
  const width = widthOf(piece);
  const restX = piece.x + piece.art.originX * PX;
  const kind = piece.motion?.kind;

  useFrame(() => {
    const group = ref.current;
    if (!group || !piece.motion) return;
    const { dx, dy, visible } = pieceState(piece, world.time);
    group.position.set(dx, dy, 0);
    group.visible = visible;
    if (kind === 'false') {
      const lit =
        world.time < world.ember.lightUntil ||
        Math.hypot(world.fireball.x - (piece.x + width / 2), world.fireball.y - piece.y) < REVEAL_RADIUS ||
        world.time < world.ember.warnUntil;
      const show = lit || triggeredFor(piece, world.time) !== null;
      if (show !== revealedRef.current) {
        revealedRef.current = show;
        setRevealed(show);
      }
    }
  });

  let tint = '#ffffff';
  if (piece.checkpoint) tint = '#ffe08a';
  if (kind === 'false' && revealed) tint = '#ff5a4a';

  return (
    <group position={[restX, piece.y, 0]}>
      <group ref={ref}>
        {piece.checkpoint && (
          <group position={[0, piece.art.height * PX * 0.5, 0]}>
            <Glow color="#ffb640" size={2.2} pulse={0.08} />
          </group>
        )}
        {kind === 'false' && revealed && (
          <group position={[0, piece.art.height * PX * 0.5, 0]}>
            <Glow color="#ff3020" size={1.8} />
          </group>
        )}
        <GameSprite art={piece.art} tint={tint} />
      </group>
      {(kind === 'fall' || kind === 'false') && (
        <group position={[-width / 2, 0, 0]}>
          <Debris
            age={() => triggeredFor(piece, world.time)}
            color={kind === 'false' ? '#ff4030' : '#3a3a46'}
            width={width}
          />
        </group>
      )}
    </group>
  );
}

const LIGHT_RADIUS = 3; // how far the fireball's light reaches
const BRIGHT_RADIUS = 5; // while Ember's LIGHT_AREA is on
const NINJA_GLOW = 1.6; // a small glow around the ninja so his footing is always visible
const DARK_FADE = 1.2; // the dark fades in over this distance at each end of the stretch
const DARKNESS = 0.82; // how dark it gets away from any light (shapes still faintly show)

/**
 * Darkness over the dark stretch: covers the platforms (but not the ninja or the fireball),
 * except for a circle of light around the fireball and a small glow around the ninja.
 * The light has hard, stepped edges to match the pixel art.
 */
function Darkness() {
  const width = DARK_ZONE.x1 - DARK_ZONE.x0 + 2 * DARK_FADE;
  const material = useMemo(
    () =>
      new ShaderMaterial({
        depthWrite: false,
        fragmentShader: `
          uniform vec2 uLight;
          uniform vec2 uNinja;
          uniform vec2 uZone;
          uniform float uRadius;
          uniform float uNinjaRadius;
          uniform float uFade;
          uniform float uDarkness;
          varying vec2 vWorld;
          float glow(vec2 at, float radius) {
            return 1.0 - smoothstep(0.45, 1.0, distance(vWorld, at) / radius);
          }
          void main() {
            float edge = min(smoothstep(uZone.x - uFade, uZone.x, vWorld.x), 1.0 - smoothstep(uZone.y, uZone.y + uFade, vWorld.x));
            float light = max(glow(uLight, uRadius), 0.8 * glow(uNinja, uNinjaRadius));
            light = floor(light * 4.0) / 4.0;
            gl_FragColor = vec4(0.02, 0.03, 0.08, uDarkness * edge * (1.0 - light));
          }`,
        transparent: true,
        uniforms: {
          uDarkness: { value: DARKNESS },
          uFade: { value: DARK_FADE },
          uLight: { value: [0, 0] },
          uNinja: { value: [0, 0] },
          uNinjaRadius: { value: NINJA_GLOW },
          uRadius: { value: LIGHT_RADIUS },
          uZone: { value: [DARK_ZONE.x0, DARK_ZONE.x1] }
        },
        vertexShader: `
          varying vec2 vWorld;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xy;
            gl_Position = projectionMatrix * viewMatrix * world;
          }`
      }),
    []
  );
  useFrame(() => {
    const bright = world.time < world.ember.lightUntil;
    material.uniforms.uLight.value = [world.fireball.x, world.fireball.y];
    material.uniforms.uNinja.value = [world.player.x, world.player.y + 0.9];
    material.uniforms.uRadius.value = bright ? BRIGHT_RADIUS : LIGHT_RADIUS;
    material.uniforms.uDarkness.value = bright ? DARKNESS * 0.7 : DARKNESS;
  });
  return (
    <mesh position={[(DARK_ZONE.x0 + DARK_ZONE.x1) / 2, 0, 0.5]} material={material}>
      <planeGeometry args={[width, 60]} />
    </mesh>
  );
}

/** Background, every platform, bridge and rooftop, and the dark stretch. */
export function Environment() {
  return (
    <>
      <Background />
      {level.map((piece) => (
        <LevelPiece key={piece.id} piece={piece} />
      ))}
      <VineWall base={vineWallBase()} height={VINE_WALL.height} width={VINE_WALL.width} x={VINE_WALL.x} />
      <Darkness />
      <Wind />
    </>
  );
}
