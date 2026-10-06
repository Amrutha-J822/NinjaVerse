import { level, triggeredFor } from './level';
import { world } from './world';

const HINT_TIME = 4; // seconds each hint stays in Ember's speech bubble

/** Ember's lines for each challenge, said once when the ninja gets there. */
const HINTS: { text: string; when: () => boolean }[] = [
  { text: 'Ready? The rooftops are your path!', when: () => world.time > 0.5 },
  { text: 'Do not trust the bridge!', when: () => world.player.x >= 3.8 },
  { text: 'Wait for the block... now!', when: () => world.player.x >= 16.5 },
  { text: 'Move quickly before it retracts!', when: () => world.player.x >= 29.8 },
  {
    text: 'Keep moving! They do not stay up!',
    when: () => level.some((p) => p.motion?.kind === 'fall' && triggeredFor(p, world.time) !== null)
  },
  { text: 'Aim for the glowing block!', when: () => world.player.x >= 35.3 },
  { text: 'Follow my light. That one is false!', when: () => world.player.x >= 41 },
  { text: 'The wind is pushing left!', when: () => world.player.x >= 49.6 }
];

const said = new Set<string>();

/** Start a new game: every hint can be said again. */
export function resetHints() {
  said.clear();
}

/** Say the first hint whose moment has come (called every frame), once the bubble is free. */
export function checkHints() {
  if (world.time < world.ember.replyUntil) return; // let Ember finish what it is saying
  const hint = HINTS.find((h) => !said.has(h.text) && h.when());
  if (!hint) return;
  said.add(hint.text);
  world.ember.reply = hint.text;
  world.ember.replyUntil = world.time + HINT_TIME;
}
