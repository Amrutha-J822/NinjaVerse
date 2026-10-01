import { Vector3 } from 'three';

/** An enemy Spider-Man can web and hit. Updated every frame by the enemy's component. */
export interface Enemy {
  position: Vector3;
  /** World position of the enemy's face, where web shots aim. */
  face: Vector3;
  halfWidth: number;
  /** Clock time until which the enemy is blinded by web. */
  blindedUntil: number;
  /** Sideways knockback speed from Spider-Man's punches and kicks. */
  knockback: number;
}

/**
 * Shared, per-frame game state. Plain mutable objects (not React state), so
 * characters can read each other every frame without re-rendering.
 */
export const world = {
  enemies: [] as Enemy[],
  player: new Vector3()
};
