/**
 * The game's noises, synthesised rather than loaded: every sound here is a few
 * oscillators and a noise burst, which keeps the whole soundtrack in one file and
 * the repository free of binary assets.
 *
 * A browser will not start an AudioContext until the user has done something, so
 * the context is built on the first sound asked for after a key or a click and the
 * calls before that are dropped.
 */

const MUTE_KEY = 'chronostrophe:muted';

type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = localStorage.getItem(MUTE_KEY) === '1';
  /** Last time each throttled sound played, so a held key is not a machine gun. */
  private last: Record<string, number> = {};

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** Called from the first input event: browsers only allow audio from a gesture. */
  unlock(): void {
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.7);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  private throttled(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? -1e9) < ms) return true;
    this.last[key] = now;
    return false;
  }

  /** One oscillator with an envelope, sliding from one pitch to another. */
  private tone(
    wave: Wave,
    from: number,
    to: number,
    dur: number,
    gain: number,
    delay = 0,
  ): void {
    const ctx = this.context();
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A band of noise: footfalls, scrapes, impacts. */
  private hiss(dur: number, gain: number, freq: number, q = 1, delay = 0): void {
    const ctx = this.context();
    if (!ctx || !this.master || !this.noise || this.muted) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  jump(): void {
    this.tone('square', 330, 620, 0.12, 0.09);
  }

  land(): void {
    if (this.throttled('land', 90)) return;
    this.hiss(0.09, 0.16, 220, 0.8);
    this.tone('sine', 150, 70, 0.1, 0.1);
  }

  push(): void {
    if (this.throttled('push', 140)) return;
    this.hiss(0.14, 0.05, 900, 0.6);
  }

  /** A monolith arriving: the loudest thing in the game. */
  impact(): void {
    if (this.throttled('impact', 200)) return;
    this.tone('sine', 90, 32, 0.55, 0.4);
    this.hiss(0.3, 0.25, 160, 0.5);
  }

  /** One click per scrubbed step, so dragging the slider sounds like a mechanism. */
  scrubTick(): void {
    if (this.throttled('scrub', 45)) return;
    this.hiss(0.02, 0.06, 2600, 6);
  }

  device(): void {
    this.tone('triangle', 520, 780, 0.16, 0.07);
    this.tone('triangle', 780, 1040, 0.14, 0.04, 0.05);
  }

  reverse(): void {
    this.tone('sawtooth', 700, 180, 0.5, 0.08);
    this.tone('sine', 180, 700, 0.5, 0.05);
  }

  paradox(): void {
    this.tone('sawtooth', 220, 190, 0.9, 0.1);
    this.tone('sawtooth', 233, 150, 0.9, 0.08);
    this.hiss(0.5, 0.1, 400, 0.7);
  }

  /** The anomaly's heartbeat, quickening as it closes. */
  anomalyBeat(): void {
    this.tone('sine', 120, 60, 0.16, 0.12);
  }

  death(): void {
    this.hiss(0.4, 0.3, 300, 0.4);
    this.tone('sawtooth', 260, 40, 0.45, 0.12);
  }

  /** Reaching the beginning or the end of time: everything dissolving. */
  dust(): void {
    this.hiss(1.6, 0.16, 1200, 0.3);
    this.tone('sine', 400, 40, 1.6, 0.08);
  }

  /** The gate taking the body: a rising whirl that falls away into the hole. */
  capture(): void {
    this.tone('sine', 220, 1100, 1.1, 0.1);
    this.tone('triangle', 110, 550, 1.2, 0.07, 0.05);
    this.tone('sine', 900, 30, 0.9, 0.12, 1.1);
    this.hiss(1.8, 0.12, 700, 0.4);
  }

  /** The screen collapsing into the anomaly. */
  collapse(): void {
    this.tone('sawtooth', 400, 25, 1.4, 0.14);
    this.hiss(1.2, 0.2, 240, 0.5);
  }

  menuMove(): void {
    this.tone('square', 520, 520, 0.04, 0.05);
  }

  menuSelect(): void {
    this.tone('square', 620, 880, 0.1, 0.07);
  }
}

export const sfx = new Sfx();
