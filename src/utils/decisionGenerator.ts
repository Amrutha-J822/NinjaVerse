import { JarvisDecision, Level } from '../types/jarvis';

/**
 * Browser fallback that mirrors `src-tauri/src/decision_generator.rs`.
 * Used when the app runs in a plain browser instead of the Tauri shell.
 */
const LEVEL_DATA: Record<Level, JarvisDecision> = {
  easy: {
    buildings: [
      { x: 0, y: 0, height: 8 },
      { x: 4, y: 0, height: 10 }
    ],
    villain_energy: 50,
    attack: 'basic',
    danger_zone: [
      [0, 0, 5],
      [4, 0, 5]
    ]
  },
  medium: {
    buildings: [
      { x: 1, y: 0, height: 12 },
      { x: 5, y: 0, height: 14 },
      { x: 8, y: 0, height: 11 }
    ],
    villain_energy: 80,
    attack: 'medium_complex',
    danger_zone: [
      [1, 0, 5],
      [5, 0, 5],
      [8, 0, 5]
    ]
  },
  hard: {
    buildings: [
      { x: -2, y: 0, height: 18 },
      { x: 3, y: 0, height: 20 },
      { x: 10, y: 0, height: 16 }
    ],
    villain_energy: 120,
    attack: 'advanced',
    danger_zone: [
      [-2, 0, 5],
      [3, 0, 5],
      [10, 0, 5]
    ]
  }
};

export function generateDecision(level: Level): JarvisDecision {
  return LEVEL_DATA[level];
}
