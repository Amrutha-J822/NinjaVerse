import React, { memo } from 'react';
import { CanvasTexture, MeshBasicMaterial, NearestFilter, PlaneGeometry, sRGBEncoding } from 'three';

import { Sprite } from './types';

// Pixels share one size across a character's sprites, so a crouch is shorter than standing
export const pixelSizeOf = (sprite: Sprite) => sprite.voxelSize ?? 0.1;
export const halfWidthOf = (sprite: Sprite) => (sprite.rows[0].length * pixelSizeOf(sprite)) / 2;
export const heightOf = (sprite: Sprite) => sprite.rows.length * pixelSizeOf(sprite);

type Built = { geometry: PlaneGeometry; material: MeshBasicMaterial; offsetX: number; offsetY: number };
const cache = new WeakMap<Sprite, Built>();

/** Paint the sprite's pixels into a texture once and reuse it every time the sprite is shown. */
function build(sprite: Sprite): Built {
  const cached = cache.get(sprite);
  if (cached) return cached;
  const width = sprite.rows[0].length;
  const height = sprite.rows.length;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  sprite.rows.forEach((row, r) =>
    row.split('').forEach((key, c) => {
      if (key === '.') return;
      ctx.fillStyle = sprite.colors[key];
      ctx.fillRect(c, r, 1, 1);
    })
  );
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter; // crisp, blocky pixels
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.encoding = sRGBEncoding;
  const size = pixelSizeOf(sprite);
  const built = {
    geometry: new PlaneGeometry(width * size, height * size),
    // Unlit and not tone mapped, so the palette shows exactly as drawn
    material: new MeshBasicMaterial({ alphaTest: 0.5, map: texture, toneMapped: false }),
    offsetX: (width / 2 - (sprite.originX ?? width / 2)) * size,
    offsetY: (height * size) / 2
  };
  cache.set(sprite, built);
  return built;
}

/** A flat 2D pixel-art sprite, standing on y = 0 with its origin column at x = 0. */
export const PixelSprite = memo(({ sprite }: { sprite: Sprite }) => {
  const { geometry, material, offsetX, offsetY } = build(sprite);
  return <mesh geometry={geometry} material={material} position={[offsetX, offsetY, 0]} />;
});
