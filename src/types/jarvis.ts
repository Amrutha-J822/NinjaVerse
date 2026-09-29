export type Level = 'easy' | 'medium' | 'hard';

export interface Building {
  x: number;
  y: number;
  height: number;
}

export interface JarvisDecision {
  buildings: Building[];
  villain_energy: number;
  attack: string;
  /** Each entry is [x, y, radius]. */
  danger_zone: [number, number, number][];
}