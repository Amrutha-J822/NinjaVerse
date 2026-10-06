import { Vector3 } from 'three';

/**
 * Shared, per-frame game state. Plain mutable objects (not React state), so the
 * camera, the fireball and its light can follow the ninja every frame without re-rendering.
 */
export const world = {
  /** Game clock in seconds. It stops while the game is paused or you are talking to Ember. */
  time: 0,
  paused: false,
  /** 1 = facing right, -1 = facing left */
  facing: 1,
  player: new Vector3(),
  velocity: new Vector3(),
  grounded: true,
  /** The fireball's position: its light reveals the dark stretch */
  fireball: new Vector3(),
  ember: {
    /** Ember's latest spoken reply, shown above the fireball until replyUntil */
    reply: '',
    replyUntil: 0,
    /** LIGHT_AREA: brighter, wider light until this time */
    lightUntil: 0,
    /** WARN_UNSAFE_PLATFORM: the platform Ember is warning about, until warnUntil */
    warnPieceId: 0,
    warnUntil: 0,
    /** SLOW_FALL: gentle falling until this time */
    slowFallUntil: 0,
    /** PUSH_TOWARD_LEDGE: carried in an arc onto a ledge (sideways speed until pushUntil, and an upward launch) */
    pushUntil: 0,
    pushSpeed: 0,
    launchVy: 0,
    /** Where the rescue is heading, so Ember can fly ahead and leave a flame trail */
    rescueX: 0,
    rescueY: 0,
    /** BURN_VINES: Ember is breathing fire at the vines until this time */
    burnUntil: 0,
    /** When each ability can be used again */
    readyAt: { BURN_VINES: 0, LIGHT_AREA: 0, PUSH_TOWARD_LEDGE: 0, SLOW_FALL: 0, WARN_UNSAFE_PLATFORM: 0 } as Record<
      string,
      number
    >,
    /** Rescues left this game */
    usesLeft: { PUSH_TOWARD_LEDGE: 3, SLOW_FALL: 3 } as Record<string, number>
  }
};

/** Start a fresh game: clock and Ember's abilities back to the beginning. */
export function resetWorld() {
  world.time = 0;
  world.paused = false;
  world.ember.reply = '';
  world.ember.replyUntil = 0;
  world.ember.lightUntil = 0;
  world.ember.warnPieceId = 0;
  world.ember.warnUntil = 0;
  world.ember.slowFallUntil = 0;
  world.ember.pushUntil = 0;
  world.ember.launchVy = 0;
  world.ember.burnUntil = 0;
  world.ember.readyAt = { BURN_VINES: 0, LIGHT_AREA: 0, PUSH_TOWARD_LEDGE: 0, SLOW_FALL: 0, WARN_UNSAFE_PLATFORM: 0 };
  world.ember.usesLeft = { PUSH_TOWARD_LEDGE: 3, SLOW_FALL: 3 };
}
