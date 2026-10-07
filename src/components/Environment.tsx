import React, { useMemo, useRef, useState } from 'react';
import { Group, MeshBasicMaterial, ShaderMaterial } from 'three';

import { useFrame, useThree } from '@react-three/fiber';

import { art, backgroundArt, backgroundDawnArt, SURFACE_COLUMN } from '../game/art';
import { dawn, endingTime, LANTERN, lightWave, T } from '../game/ending';
import {
  DARK_ZONE,
  highestRoof,
  level,
  LEVEL_WIDTH,
  Piece,
  pieceState,
  PX,
  triggeredFor,
  vineState,
  widthOf
} from '../game/level';
import { world } from '../game/world';

import { BridgeFire, Debris, Glow, Wind } from './Effects';
import { GameSprite, textureFor } from './GameSprite';

const background = { ...backgroundArt, originX: backgroundArt.width / 2 };
const dawnArt = backgroundDawnArt;
const dawnMaterial = new MeshBasicMaterial({
  depthWrite: false,
  map: textureFor(backgroundDawnArt.src),
  opacity: 0,
  toneMapped: false,
  transparent: true
});

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
    const since = endingTime(world.time);
    dawnMaterial.opacity = since === null ? 0 : dawn(since);
  });

  return (
    <group ref={ref}>
      <GameSprite art={background} anchor="center" shaded={false} />
      {/* Sunrise over the same city, fading in at the end of the journey */}
      <mesh position={[0, 0, 0.01]} material={dawnMaterial}>
        <planeGeometry args={[dawnArt.width * PX, dawnArt.height * PX]} />
      </mesh>
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
  const glowingBlock = piece.checkpoint && piece.art === art.stepBlock; // the shrine rooftop has its own lantern
  if (glowingBlock) tint = '#ffe08a';
  if (kind === 'false' && revealed) tint = '#ff5a4a';

  return (
    <group position={[restX, piece.y, 0]}>
      <group ref={ref}>
        {glowingBlock && (
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

/**
 * The overgrown bridge. Its vines cover it completely until Ember burns them: the fire
 * sweeps from the near end to the far end, the vines vanish behind a glowing burning edge,
 * and the cleared, charred beam shows underneath for the ninja to cross.
 */
function OvergrownBridge({ piece }: { piece: Piece }) {
  const width = widthOf(piece);
  const height = piece.art.height * PX;
  const restX = piece.x + piece.art.originX * PX;
  const beam = useRef<Group>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        fragmentShader: `
          uniform sampler2D uMap;
          uniform float uFront;
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vec4 color = texture2D(uMap, vUv);
            float past = vUv.x - uFront;
            if (color.a < 0.5 || past < 0.0) discard;
            if (uFront > 0.0 && past < 0.025) {
              // the burning edge flickers between orange and yellow
              color.rgb = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.35), step(0.5, fract(uTime * 12.0 + vUv.y * 7.0)));
            } else if (uFront > 0.0 && past < 0.07) {
              color.rgb *= vec3(1.0, 0.55, 0.35); // scorched just ahead of the fire
            }
            gl_FragColor = color;
            #include <encodings_fragment>
          }`,
        uniforms: { uFront: { value: 0 }, uMap: { value: textureFor(piece.art.src) }, uTime: { value: 0 } },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`
      }),
    [piece]
  );
  useFrame(() => {
    const state = vineState(world.time);
    material.uniforms.uFront.value = state.front;
    material.uniforms.uTime.value = world.time;
    if (beam.current) beam.current.visible = state.front > 0;
  });
  return (
    <group position={[restX, piece.y, 0]}>
      {/* The charred beam, revealed as the vines burn away */}
      <group ref={beam} visible={false}>
        <GameSprite art={art.vineBeamBurnt} />
      </group>
      <mesh position={[0, height / 2, 0.01]} material={material}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <group position={[-width / 2, (art.vineBeamBurnt.surfaces[0] ?? 0) * PX, 0.1]}>
        <BridgeFire front={() => vineState(world.time)} width={width} />
      </group>
    </group>
  );
}

/**
 * The highest rooftop and its giant lantern: dark until Ember floats in and lights it.
 * It flickers on, a burst of light spreads out, and then it glows steadily.
 */
function LanternRoof({ piece }: { piece: Piece }) {
  const lit = useRef<Group>(null);
  const glow = useRef<Group>(null);
  const burst = useRef<Group>(null);
  const restX = piece.x + piece.art.originX * PX;
  useFrame(() => {
    const since = endingTime(world.time);
    const after = since === null ? -1 : since - T.ignite;
    const on = after >= 0 && (after > 0.5 || Math.floor(after * 12) % 2 === 0); // flickers, then stays lit
    if (lit.current) lit.current.visible = on;
    if (glow.current) {
      glow.current.visible = on;
      glow.current.scale.setScalar(Math.min(1, after / 0.6) * (1 + Math.sin(world.time * 3) * 0.05));
    }
    if (burst.current) {
      burst.current.visible = after >= 0 && after < 1;
      burst.current.scale.setScalar(1 + after * 5);
    }
  });
  const lantern: [number, number, number] = [LANTERN.x - restX, LANTERN.y - piece.y, 0.3];
  return (
    <group position={[restX, piece.y, 0]}>
      <GameSprite art={art.lanternRoofDormant} />
      <group ref={lit} position={[0, 0, 0.01]} visible={false}>
        <GameSprite art={art.lanternRoof} />
      </group>
      <group ref={glow} position={lantern} visible={false}>
        <Glow color="#ffb040" size={5} />
      </group>
      <group ref={burst} position={lantern} visible={false}>
        <Glow color="#ffd070" size={2} />
      </group>
    </group>
  );
}

// Little lights along every rooftop path: they come on one after another, running back from
// the lantern to the start once Ember lights it. Moving and vanishing platforms get none.
const LIGHT_EVERY = 6; // surface columns between lights
const pathLights = level.flatMap((piece) => {
  const kind = piece.motion?.kind;
  if (kind === 'drift' || kind === 'false' || kind === 'flame') return [];
  const surfaces = piece.overgrown ? art.vineBeamBurnt.surfaces : piece.art.surfaces;
  const column = SURFACE_COLUMN * PX;
  return surfaces.flatMap((surface, c) =>
    surface === null || c % LIGHT_EVERY !== 3
      ? []
      : [{ x: piece.x + (c + 0.5) * column, y: piece.y + surface * PX + 0.12 }]
  );
});

function PathLights() {
  const group = useRef<Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const since = endingTime(world.time);
    const front = since === null ? Infinity : LANTERN.x - lightWave(since) * LANTERN.x;
    g.children.forEach((child, i) => {
      const light = child;
      const age = (pathLights[i].x - front) / 1.5; // pops in as the light reaches it
      light.visible = age > 0;
      light.scale.setScalar(Math.min(1, 0.3 + age) * (1 + Math.sin(world.time * 5 + i) * 0.08));
    });
  });
  return (
    <group ref={group}>
      {pathLights.map(({ x, y }) => (
        <group key={`${x},${y}`} position={[x, y, 0.6]} visible={false}>
          <Glow color="#ffa040" size={0.8} />
          <mesh>
            <planeGeometry args={[0.1, 0.12]} />
            <meshBasicMaterial color="#ffd27a" toneMapped={false} />
          </mesh>
        </group>
      ))}
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
    const since = endingTime(world.time);
    const lift = since === null ? 1 : 1 - dawn(since); // the dark stretch brightens at sunrise
    material.uniforms.uDarkness.value = (bright ? DARKNESS * 0.7 : DARKNESS) * lift;
  });
  return (
    <mesh position={[(DARK_ZONE.x0 + DARK_ZONE.x1) / 2, 0, 0.5]} material={material}>
      <planeGeometry args={[width, 60]} />
    </mesh>
  );
}

/** One platform, bridge or rooftop. */
function AnyPiece({ piece }: { piece: Piece }) {
  if (piece.overgrown) return <OvergrownBridge piece={piece} />;
  if (piece === highestRoof) return <LanternRoof piece={piece} />;
  return <LevelPiece piece={piece} />;
}

/** Background, every platform, bridge and rooftop, the dark stretch, and the path lights. */
export function Environment() {
  return (
    <>
      <Background />
      {level
        .filter((piece) => piece.motion?.kind !== 'flame') // the flame steps are drawn with the flame path
        .map((piece) => (
          <AnyPiece key={piece.id} piece={piece} />
        ))}
      <PathLights />
      <Darkness />
      <Wind />
    </>
  );
}
