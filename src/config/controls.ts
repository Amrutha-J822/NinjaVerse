/**
 * Keyboard map for drei's KeyboardControls.
 *
 * | Action          | Keys                            |
 * | Run             | Left and Right arrows           |
 * | Jump            | Up arrow                        |
 * | Ninja high jump | Up arrow again while in the air |
 * | Talk to Ember   | T (handled by the game scene)   |
 */
export const keyMap = [
  { keys: ['ArrowLeft'], name: 'left' },
  { keys: ['ArrowRight'], name: 'right' },
  { keys: ['ArrowUp'], name: 'jump' }
];

/** Controls shown on the Help screen. */
export const controlsHelp = [
  { action: 'Run', keys: '← →' },
  { action: 'Jump', keys: '↑' },
  { action: 'Ninja high jump', keys: '↑ twice' },
  { action: 'Talk to Ember', keys: 'T' },
  { action: 'Pause', keys: 'Esc' }
];
