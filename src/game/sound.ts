/**
 * The game's sounds, played with the Web Audio API so many can overlap without delay.
 * Every sound in assets/sounds/ is loaded once; play() starts one, and loops (music,
 * wind) keep running until stopped. Browsers only allow sound after a key press or
 * click, so the first one switches it on.
 */

const files = import.meta.glob('../../assets/sounds/*.wav', { as: 'url', eager: true });
// Each sound is known by its file name, without the folder or ".wav"
const urls = new Map(Object.entries(files).map(([path, url]) => [path.replace(/^.*\/|\.wav$/g, ''), url]));

let context: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
// Loops asked to play before their sound had loaded, started as soon as it arrives
const waiting = new Map<string, () => void>();

function audio() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.connect(context.destination);
    urls.forEach((url, name) => {
      fetch(url)
        .then((res) => res.arrayBuffer())
        .then((data) => (context as AudioContext).decodeAudioData(data))
        .then((buffer) => {
          buffers.set(name, buffer);
          waiting.get(name)?.();
          waiting.delete(name);
        })
        .catch(() => undefined);
    });
  }
  if (context.state === 'suspended') context.resume().catch(() => undefined);
  return { ctx: context, out: master as GainNode };
}

// Sound switches on with the first key press or click
['keydown', 'pointerdown'].forEach((type) => window.addEventListener(type, () => audio()));

type Options = { volume?: number; rate?: number };

/** Play a sound once (silently skipped if it hasn't loaded yet). */
export function play(name: string, { rate = 1, volume = 1 }: Options = {}) {
  const { ctx, out } = audio();
  const buffer = buffers.get(name);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(out);
  source.start();
}

/** Play one of several sounds, picked at random, with a slightly varied pitch. */
export function playAny(names: string[], options: Options = {}) {
  const name = names[Math.floor(Math.random() * names.length)];
  play(name, { ...options, rate: (options.rate ?? 1) * (0.94 + Math.random() * 0.12) });
}

/** A looping sound whose volume can be faded smoothly (0 = silent). */
class Loop {
  private gain: GainNode | null = null;

  private started = false;

  private target = -1;

  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  /** Fade to this volume over `seconds`. The loop starts the first time it is turned up. */
  fadeTo(volume: number, seconds = 0.5) {
    if (this.started && volume === this.target) return;
    const { ctx, out } = audio();
    if (!this.started) {
      const buffer = buffers.get(this.name);
      if (volume <= 0) {
        waiting.delete(this.name); // turned down before it ever started: don't start it later
        return;
      }
      if (!buffer) {
        waiting.set(this.name, () => this.fadeTo(volume, seconds)); // not loaded yet: starts once it is
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      source.connect(this.gain).connect(out);
      source.start();
      this.started = true;
    }
    this.target = volume;
    const { gain } = this.gain as GainNode;
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(gain.value, ctx.currentTime);
    gain.linearRampToValueAtTime(volume, ctx.currentTime + seconds);
  }
}

/** The music, on the title screen and in the game (one loop, so it carries on between them). */
export const music = new Loop('title-loop');
export const wind = new Loop('wind-loop');
