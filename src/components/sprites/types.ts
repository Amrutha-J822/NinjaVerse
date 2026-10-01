/**
 * A pixel-art character drawn as one voxel (small cube) per pixel.
 * Each character in `rows` is a key into `colors`; '.' is empty.
 * Rows run top to bottom.
 */
export interface Sprite {
  colors: Record<string, string>;
  rows: string[];
  /** Size of one pixel in world units (default 0.1). */
  voxelSize?: number;
  /** Which way the art faces: 1 = right, -1 = left, omitted = symmetric (never flipped). */
  faces?: 1 | -1;
  /** Column (in pixels from the left) that sits on the character's position; default is the center. */
  originX?: number;
}
