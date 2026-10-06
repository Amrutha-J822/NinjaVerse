import React, { memo, useMemo } from 'react';
import { MeshBasicMaterial, NearestFilter, PlaneGeometry, sRGBEncoding, Texture, TextureLoader } from 'three';

import { PX } from '../game/level';

export interface SpriteArt {
  src: string;
  width: number;
  height: number;
  /** Column (image pixels from the left) that sits on the sprite's position. */
  originX: number;
}

const loader = new TextureLoader();
const textures = new Map<string, Texture>();

/** Load each picture once, with crisp nearest-neighbor pixels. */
function textureFor(src: string) {
  let texture = textures.get(src);
  if (!texture) {
    texture = loader.load(src);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.encoding = sRGBEncoding;
    textures.set(src, texture);
  }
  return texture;
}

type Props = {
  art: SpriteArt;
  /** Where the origin sits: 'bottom' (feet on the position) or 'center'. */
  anchor?: 'bottom' | 'center';
  /** Color multiplied over the picture (white leaves it as drawn). */
  tint?: string;
};

/** A flat 2D pixel-art picture. Unlit, so it shows exactly as drawn. */
export const GameSprite = memo(({ anchor = 'bottom', art, tint = '#ffffff' }: Props) => {
  const geometry = useMemo(() => new PlaneGeometry(art.width * PX, art.height * PX), [art]);
  const material = useMemo(
    () => new MeshBasicMaterial({ alphaTest: 0.5, color: tint, map: textureFor(art.src), toneMapped: false }),
    [art, tint]
  );
  const x = (art.width / 2 - art.originX) * PX;
  const y = anchor === 'bottom' ? (art.height * PX) / 2 : 0;
  return <mesh geometry={geometry} material={material} position={[x, y, 0]} />;
});
