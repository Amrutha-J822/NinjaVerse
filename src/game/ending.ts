import { highestRoof, PX } from './level';

/**
 * The ending, once the ninja lands on the highest rooftop at sunrise: he walks up to the
 * giant dormant lantern, Ember floats into it and lights it, the light runs back along every
 * rooftop path he crossed while dawn arrives, Ember returns to his side, they talk, and the
 * scene fades to silhouettes with "The journey continues..." and the end buttons.
 * Times are seconds after he lands.
 */
export const T = {
  emberIn: 0.6, // Ember floats into the lantern
  ignite: 2.2, // ...and lights it
  pullOut: 3, // the camera pulls back over the city
  wave: 3.4, // the light starts running back along the paths
  waveTime: 5,
  dawnTime: 5.5,
  pullIn: 8.9, // the camera comes back to the rooftop
  emberBack: 9.2, // Ember returns beside the ninja
  silhouette: 22.4, // everything darkens to silhouettes against the dawn
  silhouetteTime: 1.5,
  card: 23.9 // "The journey continues..." and the buttons
};

export type Speaker = 'ninja' | 'ember';
export const LINES: { who: Speaker; text: string; at: number; time: number }[] = [
  { at: 9.8, text: 'We made it.', time: 2.6, who: 'ninja' },
  { at: 12.6, text: 'You made every jump. I only helped you see the way.', time: 4, who: 'ember' },
  { at: 16.8, text: 'So... where are we going next?', time: 2.8, who: 'ninja' },
  { at: 19.8, text: 'Higher.', time: 2.4, who: 'ember' }
];

/** The middle of the giant lantern, and where the ninja stops in front of it. */
export const LANTERN = { x: highestRoof.x + 475 * PX, y: highestRoof.y + 710 * PX };
export const STAND_X = highestRoof.x + 2;

let startedAt: number | null = null;

export function startEnding(now: number) {
  if (startedAt === null) startedAt = now;
}

export function resetEnding() {
  startedAt = null;
}

/** Seconds since the ending began, or null while still playing. */
export const endingTime = (now: number) => (startedAt === null ? null : now - startedAt);

const ramp = (since: number, from: number, time: number) => Math.min(1, Math.max(0, (since - from) / time));

/** How far the light has run back from the lantern toward the start (0..1). */
export const lightWave = (since: number) => ramp(since, T.wave, T.waveTime);
/** How far the sunrise has come (0 = night, 1 = dawn). */
export const dawn = (since: number) => ramp(since, T.wave, T.dawnTime);
/** How dark the closing silhouettes are. */
export const silhouette = (since: number) => ramp(since, T.silhouette, T.silhouetteTime);

/** The line someone is saying right now ('' if none). */
export function lineFor(who: Speaker, since: number) {
  const line = LINES.find((l) => l.who === who && since >= l.at && since < l.at + l.time);
  return line ? line.text : '';
}
