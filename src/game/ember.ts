import { invoke, isTauri } from '@tauri-apps/api/core';

import {
  burnVines,
  floorBelow,
  inDark,
  inWind,
  level,
  nextPlatform,
  Piece,
  pieceState,
  standHeight,
  VINE_WALL,
  vineState,
  vineWallBase,
  widthOf,
  WIND_ZONE
} from './level';
import { world } from './world';

/**
 * Ember, the fireball companion, talks through Nemotron-Mini-4B-Instruct running in Ollama.
 * The model only suggests a reply and one action. This file checks the suggestion
 * against the real game state and carries out the action only if it is allowed.
 */

export const MODEL = 'Nemotron-Mini-4B-Instruct';
const OLLAMA_URL = 'http://localhost:11434/api/chat';

export const ACTIONS = [
  'NO_ACTION',
  'LIGHT_AREA',
  'WARN_UNSAFE_PLATFORM',
  'BURN_VINES',
  'SLOW_FALL',
  'PUSH_TOWARD_LEDGE'
] as const;
export type EmberAction = (typeof ACTIONS)[number];

export interface EmberAnswer {
  category: 'GAME_RELATED' | 'UNRELATED';
  reply: string;
  action: EmberAction;
  urgency: 'low' | 'medium' | 'high';
  /** What the game actually did, after checking the action */
  done: EmberAction;
  /** Set when the model could not be reached */
  offline?: boolean;
}

const COOLDOWN: Record<string, number> = {
  BURN_VINES: 8,
  LIGHT_AREA: 10,
  PUSH_TOWARD_LEDGE: 3,
  SLOW_FALL: 3,
  WARN_UNSAFE_PLATFORM: 4
};
const LIGHT_TIME = 6;
const WARN_TIME = 4;
const SLOW_FALL_TIME = 1.5;
const BURN_TIME = 1.4; // Ember breathes fire this long (matches the level's burn time)
const LEDGE_REACH = 3; // a ledge this close sideways can be reached by a rescue
const LEDGE_ABOVE = 2.5; // ...and this far above him
const RESCUE_APEX = 0.8; // the rescue arc peaks this far above the higher of him and the ledge
const NINJA_GRAVITY = 20; // same as the ninja's gravity
const VINE_NEAR = 3; // Ember offers to burn the vines when he is this close to them
const NEARBY = 8; // objects this close are listed in the game state
const PX_PER_UNIT = 100; // the game state uses image pixels, like the art

export const SYSTEM_PROMPT = `You are Ember, a quirky floating fireball companion helping a player-controlled ninja cross dangerous rooftops.

The ninja may ask you anything. You must classify every message as either:

1. GAME_RELATED
2. UNRELATED

GAME_RELATED questions include:

- Questions about the current route
- Which platform to jump toward
- Whether a platform is safe
- How to cross a bridge
- Whether vines are blocking the route
- Whether the ninja is falling
- What your abilities can do
- Requests for immediate traversal help
- Questions about the current game state

For GAME_RELATED questions:

- Give a short, useful answer based only on the provided game state.
- Mention the immediate danger or safest route when relevant.
- Choose one valid assistance action.
- Never invent platforms, hazards, abilities, or routes.
- Never control the ninja directly.
- Never guarantee success.

For UNRELATED questions:

- Do not answer the question.
- Respond with one short quirky fireball-style remark.
- Remind the ninja that your brain is reserved for rooftop survival.
- Be playful, friendly, and slightly dramatic.
- Do not be rude, insulting, political, or offensive.
- Do not discuss unrelated facts, current events, medical topics, legal topics, or personal advice.

Example unrelated responses:

- "I am a fireball, not a philosopher. Ask me about that suspicious platform."
- "My wisdom is currently limited to jumping, falling, and dramatic rooftop lighting."
- "That question is outside my flame radius. Try asking where to jump."
- "I could answer, but my tiny fire brain is busy preventing a rooftop disaster."
- "The rooftops are calling, ninja. Ask me something useful before the next block disappears."

Your only allowed actions are:

- NO_ACTION
- LIGHT_AREA
- WARN_UNSAFE_PLATFORM
- BURN_VINES
- SLOW_FALL
- PUSH_TOWARD_LEDGE

Action meanings:

NO_ACTION:
The ninja is safe and no assistance is needed.

LIGHT_AREA:
The route is dark or hidden. Reveal nearby platforms.

WARN_UNSAFE_PLATFORM:
The next platform is false, unstable, falling, or unsafe.

BURN_VINES:
Vines are blocking a useful route and can be burned.

SLOW_FALL:
The ninja missed a platform and is currently falling. Use only if available.

PUSH_TOWARD_LEDGE:
The ninja is falling near a reachable ledge. Use only if available and safe.

Decision priority:

1. Prevent death.
2. Rescue the ninja while falling.
3. Warn about immediate platform danger.
4. Reveal hidden routes.
5. Burn blocking vines.
6. Preserve cooldowns.
7. Do nothing when no help is needed.

Never choose an action that is unavailable or on cooldown.
Choose only one action per response.
The game engine will validate and execute the action.

Return only valid JSON in this format:

{
  "category": "GAME_RELATED",
  "reply": "The next block is unstable. Jump to the wider platform on the right.",
  "action": "WARN_UNSAFE_PLATFORM",
  "urgency": "medium"
}

Allowed category values:

- "GAME_RELATED"
- "UNRELATED"

Allowed urgency values:

- "low"
- "medium"
- "high"`;

// --- what Ember can see -----------------------------------------------------

const standingOn = () => floorBelow(world.player.x, world.player.y, world.time);
// Platforms that are not safe to land on
const unsafeKinds = ['fall', 'false'];
const isFalling = () => !world.grounded && world.velocity.y < 0;
const ready = (action: string) => world.time >= (world.ember.readyAt[action] ?? 0);
const hasUses = (action: string) => (world.ember.usesLeft[action] ?? 1) > 0;

/** The closest platform a rescue could carry him to: within reach sideways, a little above or below him. */
function reachableLedge() {
  let best: { piece: Piece; dx: number } | null = null;
  level.forEach((piece) => {
    const state = pieceState(piece, world.time);
    if (!state.solid || piece.motion?.kind === 'fall') return;
    const left = piece.x + state.dx;
    const right = left + widthOf(piece);
    // How far sideways to move to land just inside the platform's nearer edge
    let dx = 0;
    if (world.player.x < left) dx = left + 0.3 - world.player.x;
    if (world.player.x > right) dx = right - 0.3 - world.player.x;
    const top = standHeight(piece, world.time);
    const inReach = top < world.player.y + LEDGE_ABOVE && top > world.player.y - 4;
    if (inReach && dx !== 0 && Math.abs(dx) <= LEDGE_REACH && (best === null || Math.abs(dx) < Math.abs(best.dx))) {
      best = { dx, piece };
    }
  });
  return best as { piece: Piece; dx: number } | null;
}

const lit = (x: number) => world.time < world.ember.lightUntil || Math.abs(world.fireball.x - x) < 2.6 || !inDark(x);

/** The vine wall is standing just ahead of him (in the direction he faces). */
function nearVines() {
  if (!vineState(world.time).solid) return false;
  const center = VINE_WALL.x + VINE_WALL.width / 2;
  const ahead = (center - world.player.x) * world.facing;
  const sameHeight = Math.abs(world.player.y - vineWallBase()) < 2;
  return ahead > 0 && ahead < VINE_NEAR && sameHeight;
}

/** The game state Ember is given with every message, in the format from the design notes. */
export function gameState() {
  const on = standingOn()?.piece;
  const next = nextPlatform(world.player.x, world.facing, world.time, on);
  const nextX = next ? next.piece.x + widthOf(next.piece) / 2 : world.player.x;
  const nearby = level
    .filter((piece) => pieceState(piece, world.time).visible)
    .map((piece) => {
      const center = piece.x + pieceState(piece, world.time).dx + widthOf(piece) / 2;
      return { center, piece };
    })
    .filter(({ center }) => Math.abs(center - world.player.x) <= NEARBY)
    .map(({ center, piece }) => ({
      direction: center >= world.player.x ? 'ahead_right' : 'behind_left',
      distance: Math.round(Math.abs(center - world.player.x) * PX_PER_UNIT),
      height_difference: Math.round((standHeight(piece, world.time) - world.player.y) * PX_PER_UNIT),
      in_darkness: inDark(center),
      is_checkpoint: !!piece.checkpoint,
      is_moving: piece.motion?.kind === 'drift',
      is_safe: unsafeKinds.every((k) => piece.motion?.kind !== k),
      standing_on_it: piece === on,
      type: piece.label
    }));

  return {
    abilities: {
      burn_vines_available: ready('BURN_VINES'),
      light_area_available: ready('LIGHT_AREA'),
      push_toward_ledge_available: ready('PUSH_TOWARD_LEDGE') && hasUses('PUSH_TOWARD_LEDGE'),
      slow_fall_available: ready('SLOW_FALL') && hasUses('SLOW_FALL'),
      warn_available: ready('WARN_UNSAFE_PLATFORM')
    },
    nearby_objects: nearby,
    ninja: {
      health: 100,
      is_falling: isFalling(),
      is_grounded: world.grounded,
      velocity_x: Math.round(world.velocity.x * PX_PER_UNIT),
      velocity_y: Math.round(world.velocity.y * PX_PER_UNIT),
      x: Math.round(world.player.x * PX_PER_UNIT),
      y: Math.round(world.player.y * PX_PER_UNIT)
    },
    route: {
      is_dark: inDark(world.player.x) || inDark(nextX),
      next_platform_distance: next ? Math.round(next.distance * PX_PER_UNIT) : null,
      next_platform_is_safe: next ? unsafeKinds.every((k) => next.piece.motion?.kind !== k) : true,
      next_platform_is_visible: next ? lit(nextX) : true,
      next_platform_type: next ? next.piece.label : 'none (this is the end of the route)',
      vines_blocking_route: nearVines(),
      wind: inWind(world.player.x) ? `pushing ${WIND_ZONE.push < 0 ? 'left' : 'right'}` : 'none'
    }
  };
}

// --- checking and doing what Ember suggests -----------------------------------

/** The next platform ahead if it is unsafe (crumbling or false), so Ember can warn about it. */
function unsafeAhead() {
  const next = nextPlatform(world.player.x, world.facing, world.time, standingOn()?.piece);
  const unsafe = next && unsafeKinds.includes(next.piece.motion?.kind ?? '');
  return next && unsafe && next.distance < NEARBY ? next.piece : null;
}

/** Is this action allowed right now? Anything else becomes NO_ACTION. */
export function validate(action: EmberAction): boolean {
  if (action === 'NO_ACTION') return true;
  if (!ready(action) || !hasUses(action)) return false;
  if (action === 'LIGHT_AREA') return gameState().route.is_dark;
  if (action === 'WARN_UNSAFE_PLATFORM') return unsafeAhead() !== null;
  if (action === 'SLOW_FALL') return isFalling();
  if (action === 'PUSH_TOWARD_LEDGE') return isFalling() && reachableLedge() !== null;
  if (action === 'BURN_VINES') return nearVines();
  return false;
}

/** Carry out an action that passed validation. */
export function execute(action: EmberAction) {
  const { ember } = world;
  const now = world.time;
  if (action === 'NO_ACTION') return;
  ember.readyAt[action] = now + COOLDOWN[action];
  if (action in ember.usesLeft) ember.usesLeft[action] -= 1;
  if (action === 'LIGHT_AREA') ember.lightUntil = now + LIGHT_TIME;
  if (action === 'WARN_UNSAFE_PLATFORM') {
    ember.warnPieceId = unsafeAhead()?.id ?? 0;
    ember.warnUntil = now + WARN_TIME;
  }
  if (action === 'SLOW_FALL') ember.slowFallUntil = now + SLOW_FALL_TIME;
  if (action === 'PUSH_TOWARD_LEDGE') {
    // Carry him in an arc that comes down onto the ledge
    const ledge = reachableLedge();
    if (!ledge) return;
    const top = standHeight(ledge.piece, now);
    const apex = Math.max(world.player.y, top) + RESCUE_APEX;
    const launch = Math.sqrt(2 * NINJA_GRAVITY * (apex - world.player.y));
    const airtime = launch / NINJA_GRAVITY + Math.sqrt((2 * (apex - top)) / NINJA_GRAVITY);
    ember.launchVy = launch;
    ember.pushSpeed = ledge.dx / airtime;
    ember.pushUntil = now + airtime;
    ember.rescueX = world.player.x + ledge.dx;
    ember.rescueY = top;
  }
  if (action === 'BURN_VINES') {
    burnVines(now);
    ember.burnUntil = now + BURN_TIME;
  }
}

// --- talking to the model ------------------------------------------------------

const OFFLINE_REPLY =
  "My fire brain isn't switched on yet! Ask your human to start Ollama with the Nemotron-Mini-4B-Instruct model, then talk to me again.";

/** Send the system prompt and message to Ollama (through the desktop app when available). */
async function askModel(userPrompt: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('ember_chat', { model: MODEL, system: SYSTEM_PROMPT, user: userPrompt });
  }
  const res = await fetch(OLLAMA_URL, {
    body: JSON.stringify({
      format: 'json',
      messages: [
        { content: SYSTEM_PROMPT, role: 'system' },
        { content: userPrompt, role: 'user' }
      ],
      model: MODEL,
      options: { num_predict: 100, temperature: 0.2 },
      stream: false
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  return (await res.json()).message.content as string;
}

/** Pull the JSON object out of the model's text and keep only allowed values. */
function parse(text: string): Omit<EmberAnswer, 'done'> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const raw = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : {};
  const category = raw.category === 'UNRELATED' ? 'UNRELATED' : 'GAME_RELATED';
  const action = (ACTIONS as readonly string[]).includes(raw.action) ? (raw.action as EmberAction) : 'NO_ACTION';
  const urgency = ['low', 'medium', 'high'].includes(raw.urgency) ? raw.urgency : 'low';
  const reply =
    typeof raw.reply === 'string' && raw.reply.trim()
      ? raw.reply.trim().slice(0, 240)
      : 'Hmm, my flame flickered. Ask me again?';
  // Unrelated chatter never triggers an ability
  return { action: category === 'UNRELATED' ? 'NO_ACTION' : action, category, reply, urgency };
}

/** Ask Ember something. The game state is captured now, while the game is paused. */
export async function askEmber(message: string): Promise<EmberAnswer> {
  const userPrompt = `Current game state:

${JSON.stringify(gameState(), null, 2)}

Player message:

${JSON.stringify(message)}`;

  let answer: Omit<EmberAnswer, 'done'>;
  try {
    answer = parse(await askModel(userPrompt));
  } catch {
    return {
      action: 'NO_ACTION',
      category: 'GAME_RELATED',
      done: 'NO_ACTION',
      offline: true,
      reply: OFFLINE_REPLY,
      urgency: 'low'
    };
  }
  const done = validate(answer.action) ? answer.action : 'NO_ACTION';
  execute(done);
  world.ember.reply = answer.reply;
  world.ember.replyUntil = world.time + 7;
  return { ...answer, done };
}

// --- helping without being asked ------------------------------------------------

const say = (text: string) => {
  world.ember.reply = text;
  world.ember.replyUntil = world.time + 3;
};

/**
 * Ember helps on its own in two moments from the design: when the ninja walks up to
 * the vines it burns them, and when he misses a platform it carries him to the ledge
 * (limited uses). Called every frame; the same checks as the chat actions apply.
 */
export function autoAssist() {
  if (validate('BURN_VINES')) {
    execute('BURN_VINES');
    say('I will clear the shortcut!');
    return;
  }
  // Missed it: falling with nothing below, and the ledge he was going for is now above him
  const ledge = reachableLedge();
  const missed =
    isFalling() &&
    world.velocity.y < -1 &&
    floorBelow(world.player.x, world.player.y, world.time) === null &&
    ledge !== null &&
    standHeight(ledge.piece, world.time) > world.player.y + 0.1;
  if (missed && validate('PUSH_TOWARD_LEDGE')) {
    execute('PUSH_TOWARD_LEDGE');
    say('Follow my flame to the ledge!');
  }
}
