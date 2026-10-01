/**
 * Keyboard map for drei's KeyboardControls. Right- and left-handed keys are
 * both active at once. Key codes (KeyJ, ...) work regardless of Caps Lock.
 *
 * | Action          | Right-handed | Left-handed  |
 * | Punch (gut)     | J            | Z            |
 * | High kick (face)| K            | X            |
 * | Slide kick left | Down + X + Left  | Down + S + Left  |
 * | Slide kick right| Down + X + Right | Down + S + Right |
 * | Web shoot       | V            | V            |
 * | Web swing       | V + Space    | V + Space    |
 *
 * X is shared: on its own it is the left-handed high kick, with Down held it is
 * the right-handed slide kick, so it gets its own name and Characters decides.
 */
export const keyMap = [
  // Movement: two arrows together move diagonally
  { keys: ['ArrowUp'], name: 'up' },
  { keys: ['ArrowDown'], name: 'down' },
  { keys: ['ArrowLeft'], name: 'left' },
  { keys: ['ArrowRight'], name: 'right' },
  { keys: [' ', 'Space'], name: 'jump' },
  // Combat
  { keys: ['KeyJ', 'KeyZ'], name: 'punch' },
  { keys: ['KeyK'], name: 'highKick' },
  { keys: ['KeyS'], name: 'slideKick' }, // only fires with Down Arrow held
  { keys: ['KeyX'], name: 'kickOrSlide' }, // high kick, or slide kick with Down Arrow held
  { keys: ['KeyV'], name: 'web' }
];

/** Short key legend for the HUD. */
export const controlHints = [
  'Arrows move · Space jump · Esc pause',
  'Right hand: J punch · K high kick · ↓+X+←/→ slide kick',
  'Left hand: Z punch · X high kick · ↓+S+←/→ slide kick',
  'V web shot · V+Space web swing'
];
