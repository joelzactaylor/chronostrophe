/**
 * Synthesised soundtrack for Chronostrophe.
 *
 * Both tracks are rendered once via OfflineAudioContext into AudioBuffers, then
 * played back as buffer sources. This keeps the approach consistent with the
 * existing sound effects (no binary assets) and makes the level music seekable
 * to match the timeline.
 *
 * === EDITING THE MUSIC ===
 * Each `render*` function has its parameters grouped at the top. Change note
 * sequences, waveform types, tempos, and filter settings there. The rest is
 * plumbing.
 */
const MUTE_KEY = 'chronostrophe:muted';

// ───────────────────────────────────────────────────
// Pitch reference (equal temperament, A4 = 440 Hz)
// ───────────────────────────────────────────────────
const Hz = {
    C2: 65.41, Cs2: 69.30, D2: 73.42, Eb2: 77.78, E2: 82.41, F2: 87.31,
    Fs2: 92.50, G2: 98.00, Ab2: 103.83, A2: 110.00, Bb2: 116.54, B2: 123.47,
    C3: 130.81, Cs3: 138.59, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61,
    Fs3: 185.00, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
    C4: 261.63, Cs4: 277.18, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23,
    Fs4: 369.99, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
    C5: 523.25, Cs5: 554.37, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46,
    Fs5: 739.99, G5: 783.99, Ab5: 830.61, A5: 880.00, Bb5: 932.33, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98,
};

class Music {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private menuBuffer: AudioBuffer | null = null;
    private levelBuffer: AudioBuffer | null = null;

    private menuSource: AudioBufferSourceNode | null = null;
    private levelSource: AudioBufferSourceNode | null = null;

    /** Tracks a pending init() call so concurrent calls share the same promise. */
    private _initPromise: Promise<void> | null = null;

    private _menuPlaying = false;
    private _levelPlaying = false;
    private muted = localStorage.getItem(MUTE_KEY) === '1';
    /** Throttle seekLevel to avoid creating 60 buffer sources per second. */
    private lastSeekTick = -1;
    /** True while the level track is frozen (e.g. time paused on a device). */
    private _levelPaused = false;
    /** The buffer offset (seconds) the level track was frozen at. */
    private pausedOffset = 0;
    /** The ctx.currentTime at which the current levelSource conceptually started (offset-adjusted), used to detect drift. */
    private sourceStartedAt = 0;

    get isMuted(): boolean {
        return this.muted;
    }

    unlock(): void {
        const ctx = this.context();
        if (ctx && ctx.state === 'suspended') void ctx.resume();
    }

    private context(): AudioContext | null {
        if (this.ctx) return this.ctx;
        const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.35;
        this.master.connect(this.ctx.destination);
        return this.ctx;
    }

    async init(): Promise<void> {
        if (this.menuBuffer && this.levelBuffer) return;
        if (this._initPromise) return this._initPromise;
        this._initPromise = Promise.all([
            this.renderMenu(),
            this.renderLevel(),
        ]).then(([menu, level]) => {
            this.menuBuffer = menu;
            this.levelBuffer = level;
            this._initPromise = null;
        });
        return this._initPromise;
    }

    // ─────────────────────────────────────────────────
    // MENU TRACK — "Chronosphere"
    // ─────────────────────────────────────────────────
    private async renderMenu(): Promise<AudioBuffer> {
        const sr = 44100;
        const BPM = 240;
        const dur = 16 * 60 / BPM
        const len = sr * dur;
        const ctx = new OfflineAudioContext(2, len, sr);

        const PAD_NOTES = [Hz.C3, Hz.G3, Hz.Bb3, Hz.Eb4];
        const PAD_WAVE: OscillatorType = 'sawtooth';
        const PAD_DETUNE_CT = 6;
        const PAD_VOLUME = 0.1;
        const PAD_FILTER_CUTOFF = 900;
        const PAD_FILTER_LFO_DEPTH = 350;
        const PAD_FILTER_LFO_RATE = 0.12;

        const BASS_PATTERN = [Hz.C2, Hz.G2, Hz.Bb2, Hz.G2];
        const BASS_VOLUME = 0.45;
        const BASS_DECAY = 0.40;

        const ARP_PHRASE_A = [Hz.C4, Hz.Eb4, Hz.G4, Hz.Bb4, Hz.C5, Hz.Bb4, Hz.G4, Hz.Eb4];
        const ARP_PHRASE_B = [Hz.G4, Hz.Bb4, Hz.Eb5, Hz.D5, Hz.C5, Hz.G4, Hz.Eb4, Hz.C4];
        const ARP_NOTES = [...ARP_PHRASE_A, ...ARP_PHRASE_B];
        const ARP_WAVE: OscillatorType = 'triangle';
        const ARP_VOLUME = 0.6;
        const ARP_VELOCITIES = [0.14, 0.09, 0.12, 0.08, 0.14, 0.10, 0.11, 0.08,
            0.11, 0.08, 0.14, 0.10, 0.12, 0.09, 0.08, 0.13];

        const NOISE_VOLUME = 0.0042;
        const NOISE_FILTER_FREQ = 2200;

        const beatLen = 60 / BPM;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.55, 0);
        master.connect(ctx.destination);

        const padGain = ctx.createGain();
        padGain.gain.setValueAtTime(PAD_VOLUME, 0);
        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.setValueAtTime(PAD_FILTER_CUTOFF, 0);
        padFilter.Q.setValueAtTime(0.6, 0);
        padGain.connect(padFilter).connect(master);

        const padLfo = ctx.createOscillator();
        padLfo.type = 'sine';
        padLfo.frequency.setValueAtTime(PAD_FILTER_LFO_RATE, 0);
        const padLfoGain = ctx.createGain();
        padLfoGain.gain.setValueAtTime(PAD_FILTER_LFO_DEPTH, 0);
        padLfo.connect(padLfoGain).connect(padFilter.frequency);
        padLfo.start(0);
        padLfo.stop(dur);

        for (const f of PAD_NOTES) {
            for (const dt of [-PAD_DETUNE_CT, PAD_DETUNE_CT]) {
                const osc = ctx.createOscillator();
                osc.type = PAD_WAVE;
                osc.frequency.setValueAtTime(f, 0);
                osc.detune.setValueAtTime(dt, 0);
                const v = ctx.createGain();
                v.gain.setValueAtTime(0.06, 0);
                osc.connect(v).connect(padGain);
                osc.start(0);
                osc.stop(dur);
            }
        }

        const bassGain = ctx.createGain();
        bassGain.gain.setValueAtTime(0, 0);
        const bassOsc = ctx.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(BASS_PATTERN[0], 0);
        bassOsc.connect(bassGain).connect(master);
        bassOsc.start(0);
        bassOsc.stop(dur);

        const totalBeats = dur / beatLen;
        for (let b = 0; b < totalBeats; b++) {
            const t = b * beatLen;
            const vel = b % 4 === 0 ? BASS_VOLUME : BASS_VOLUME * 0.5;
            bassOsc.frequency.setValueAtTime(BASS_PATTERN[b % BASS_PATTERN.length], t);
            bassGain.gain.setValueAtTime(0, t);
            bassGain.gain.linearRampToValueAtTime(vel, t + 0.008);
            bassGain.gain.linearRampToValueAtTime(0, t + beatLen * BASS_DECAY);
        }

        const arpGain = ctx.createGain();
        arpGain.gain.setValueAtTime(0, 0);
        const arpOsc = ctx.createOscillator();
        arpOsc.type = ARP_WAVE;
        arpOsc.frequency.setValueAtTime(ARP_NOTES[0], 0);
        arpOsc.connect(arpGain).connect(master);
        arpOsc.start(0);
        arpOsc.stop(dur);

        const stepLen = 60 / BPM
        const arpPatLen = ARP_NOTES.length;
        const totalSteps = 16;
        for (let i = 0; i < totalSteps; i++) {
            const t = i * stepLen;
            const noteIdx = i % arpPatLen;
            arpOsc.frequency.setValueAtTime(ARP_NOTES[noteIdx], t);
            const vel = ARP_VOLUME * ARP_VELOCITIES[noteIdx];
            arpGain.gain.setValueAtTime(0, t);
            arpGain.gain.linearRampToValueAtTime(vel, t + 0.004);
            arpGain.gain.linearRampToValueAtTime(0, t + stepLen * 0.65);
        }

        const noiseLen = sr * dur;
        const noiseBuf = ctx.createBuffer(1, noiseLen, sr);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(NOISE_FILTER_FREQ, 0);
        noiseFilter.Q.setValueAtTime(0.4, 0);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(NOISE_VOLUME, 0);
        noiseSrc.connect(noiseFilter).connect(noiseGain).connect(master);
        noiseSrc.start(0);

        const buffer = await ctx.startRendering();
        return buffer;
    }

    // ─────────────────────────────────────────────────
    // LEVEL TRACK — "Timeline"
    // Exactly 60 s (the seek math in seekLevel() assumes this).
    //
    // This is deliberately NOT a separate composition. It reuses the
    // menu track's exact chord (PAD_NOTES), bass line (BASS_PATTERN),
    // and both arp phrases verbatim — same key, same tempo, same
    // voices — so it reads as "the same song" rather than a different
    // piece of music.
    //
    // What changes is arrangement, split into six 10 s segments so a
    // long, looping gameplay track has real variety instead of the
    // menu's short 4 s loop repeating fifteen times in a row:
    //
    //   0-10 s   Groove only — pad + bass, no arp (mirrors the menu's
    //            own opening bars before the arp comes in)
    //  10-20 s   Phrase A, at the menu's own octave
    //  20-30 s   Phrase B, shifted up an octave, half-time — a
    //            deliberately different contour so it doesn't feel
    //            like a repeat of the last segment
    //  30-40 s   The menu's full 16-note theme (A + B back to back),
    //            quoted directly
    //  40-50 s   Climax — phrase A doubled in octaves as a fast
    //            call-and-response, full percussion
    //  50-60 s   Phrase B alone, slowed down, percussion stripped back
    //            — winds back to the intro feel so the loop point
    //            doesn't jar
    // ─────────────────────────────────────────────────
    private async renderLevel(): Promise<AudioBuffer> {
        const sr = 44100;
        const dur = 60;
        const len = sr * dur;
        const ctx = new OfflineAudioContext(2, len, sr);

        // ── EDITABLE PARAMETERS ─────────────────────────────────────
        const BPM = 240; // same tempo as the menu track
        const SECTION_LEN = 10;
        const stepLen = 60 / BPM; // same step length the menu arp uses
        const beatLen = stepLen; // "beat" here = one menu-arp step
        const PAD_NOTES = [Hz.C3, Hz.G3, Hz.Bb3, Hz.Eb4]; // identical chord to the menu pad
        const PAD_WAVE: OscillatorType = 'sawtooth';
        const PAD_DETUNE_CT = 6;
        const PAD_VOLUME = 0.16;
        const PAD_FILTER_FREQS = [700, 900, 1100, 1300, 1800, 800]; // brightness arc across segments

        const BASS_PATTERN = [Hz.C2, Hz.G2, Hz.Bb2, Hz.G2]; // identical to the menu bass line
        const BASS_VOLUME = 0.5;
        const BASS_DECAY = 0.40;

        const ARP_PHRASE_A = [Hz.C4, Hz.Eb4, Hz.G4, Hz.Bb4, Hz.C5, Hz.Bb4, Hz.G4, Hz.Eb4];
        const ARP_PHRASE_B = [Hz.G4, Hz.Bb4, Hz.Eb5, Hz.D5, Hz.C5, Hz.G4, Hz.Eb4, Hz.C4];
        const ARP_PHRASE_A_LOW = ARP_PHRASE_A.map((f) => f / 2); // octave down — mellow variant
        const ARP_PHRASE_B_HIGH = ARP_PHRASE_B.map((f) => f * 2); // octave up — bright variant
        const ARP_THEME = [...ARP_PHRASE_A, ...ARP_PHRASE_B]; // the menu's full theme, verbatim
        // Call-and-response: phrase A answered an octave down, note by note.
        const ARP_CLIMAX = ARP_PHRASE_A.flatMap((f, i) => [f, ARP_PHRASE_A_LOW[i]]);
        const ARP_VOLUME = 0.6;

        interface Segment {
            arp: number[] | null;
            arpStepLen: number;
            bassEvery: number; // play the bass pattern every Nth beat
            kick: boolean;
            snare: boolean;
            hat: boolean;
            volume: number; // section intensity multiplier
        }

        const SEGMENTS: Segment[] = [
            { arp: null, arpStepLen: stepLen, bassEvery: 1, kick: true, snare: false, hat: false, volume: 0.75 },
            { arp: ARP_PHRASE_A, arpStepLen: stepLen, bassEvery: 1, kick: true, snare: false, hat: true, volume: 0.9 },
            { arp: ARP_PHRASE_B_HIGH, arpStepLen: stepLen * 2, bassEvery: 2, kick: true, snare: true, hat: true, volume: 0.95 },
            { arp: ARP_THEME, arpStepLen: stepLen, bassEvery: 1, kick: true, snare: true, hat: true, volume: 1.0 },
            { arp: ARP_CLIMAX, arpStepLen: stepLen / 2, bassEvery: 1, kick: true, snare: true, hat: true, volume: 1.15 },
            { arp: ARP_PHRASE_B, arpStepLen: stepLen * 1.5, bassEvery: 1, kick: true, snare: false, hat: false, volume: 0.75 },
        ];
        // ── END EDITABLE PARAMETERS ────────────────────────────────────

        const master = ctx.createGain();
        master.gain.setValueAtTime(0.5, 0);
        master.connect(ctx.destination);

        // Pad — identical detuned-sawtooth chord to the menu track; only
        // the filter brightness sweeps to track the segment arc.
        const padGain = ctx.createGain();
        padGain.gain.setValueAtTime(PAD_VOLUME, 0);
        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.Q.setValueAtTime(0.6, 0);
        padFilter.frequency.setValueAtTime(PAD_FILTER_FREQS[0], 0);
        for (let sec = 0; sec < 6; sec++) {
            padFilter.frequency.linearRampToValueAtTime(PAD_FILTER_FREQS[sec], sec * SECTION_LEN + 0.1);
        }
        padGain.connect(padFilter).connect(master);

        for (const f of PAD_NOTES) {
            for (const dt of [-PAD_DETUNE_CT, PAD_DETUNE_CT]) {
                const osc = ctx.createOscillator();
                osc.type = PAD_WAVE;
                osc.frequency.setValueAtTime(f, 0);
                osc.detune.setValueAtTime(dt, 0);
                const v = ctx.createGain();
                v.gain.setValueAtTime(0.06, 0);
                osc.connect(v).connect(padGain);
                osc.start(0);
                osc.stop(dur);
            }
        }

        // Bass — identical pattern and voice to the menu; only the
        // density (bassEvery) changes per segment.
        const bassGain = ctx.createGain();
        bassGain.gain.setValueAtTime(0, 0);
        const bassOsc = ctx.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(BASS_PATTERN[0], 0);
        bassOsc.connect(bassGain).connect(master);
        bassOsc.start(0);
        bassOsc.stop(dur);

        for (let sec = 0; sec < 6; sec++) {
            const seg = SEGMENTS[sec];
            const t0 = sec * SECTION_LEN;
            const beatsPerSection = Math.floor(SECTION_LEN / beatLen);
            for (let b = 0; b < beatsPerSection; b += seg.bassEvery) {
                const t = t0 + b * beatLen;
                const note = BASS_PATTERN[b % BASS_PATTERN.length];
                const vel = (b % 4 === 0 ? BASS_VOLUME : BASS_VOLUME * 0.5) * seg.volume;
                bassOsc.frequency.setValueAtTime(note, t);
                bassGain.gain.setValueAtTime(0, t);
                bassGain.gain.linearRampToValueAtTime(vel, t + 0.008);
                bassGain.gain.linearRampToValueAtTime(0, t + beatLen * BASS_DECAY);
            }
        }

        // Arp — same triangle voice as the menu. Which phrase plays, at
        // what octave, and at what step length is entirely down to
        // SEGMENTS above.
        const arpGain = ctx.createGain();
        arpGain.gain.setValueAtTime(0, 0);
        const arpOsc = ctx.createOscillator();
        arpOsc.type = 'triangle';
        arpOsc.frequency.setValueAtTime(Hz.C4, 0);
        arpOsc.connect(arpGain).connect(master);
        arpOsc.start(0);
        arpOsc.stop(dur);

        for (let sec = 0; sec < 6; sec++) {
            const seg = SEGMENTS[sec];
            if (!seg.arp) continue;
            const t0 = sec * SECTION_LEN;
            const steps = Math.floor(SECTION_LEN / seg.arpStepLen);
            for (let i = 0; i < steps; i++) {
                const t = t0 + i * seg.arpStepLen;
                const note = seg.arp[i % seg.arp.length];
                arpOsc.frequency.setValueAtTime(note, t);
                const vel = ARP_VOLUME * 0.36 * seg.volume;
                arpGain.gain.setValueAtTime(0, t);
                arpGain.gain.linearRampToValueAtTime(vel, t + 0.004);
                arpGain.gain.linearRampToValueAtTime(0, t + seg.arpStepLen * 0.65);
            }
        }

        // Percussion — the one genuinely new element, since the menu
        // track has no beat of its own; on/off per segment for contrast.
        const kickGain = ctx.createGain();
        kickGain.gain.setValueAtTime(0, 0);
        const kickOsc = ctx.createOscillator();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(120, 0);
        kickOsc.connect(kickGain).connect(master);
        kickOsc.start(0);
        kickOsc.stop(dur);

        const snareNoiseBuf = ctx.createBuffer(1, sr * dur, sr);
        {
            const snd = snareNoiseBuf.getChannelData(0);
            for (let i = 0; i < snd.length; i++) snd[i] = Math.random() * 2 - 1;
        }
        const snareSrc = ctx.createBufferSource();
        snareSrc.buffer = snareNoiseBuf;
        const snareFilter = ctx.createBiquadFilter();
        snareFilter.type = 'bandpass';
        snareFilter.frequency.setValueAtTime(1800, 0);
        snareFilter.Q.setValueAtTime(0.8, 0);
        const snareGain = ctx.createGain();
        snareGain.gain.setValueAtTime(0, 0);
        snareSrc.connect(snareFilter).connect(snareGain).connect(master);
        snareSrc.start(0);

        const hatNoiseBuf = ctx.createBuffer(1, sr * dur, sr);
        {
            const hnd = hatNoiseBuf.getChannelData(0);
            for (let i = 0; i < hnd.length; i++) hnd[i] = Math.random() * 2 - 1;
        }
        const hatSrc = ctx.createBufferSource();
        hatSrc.buffer = hatNoiseBuf;
        const hatFilter = ctx.createBiquadFilter();
        hatFilter.type = 'highpass';
        hatFilter.frequency.setValueAtTime(7000, 0);
        hatFilter.Q.setValueAtTime(0.5, 0);
        const hatGain = ctx.createGain();
        hatGain.gain.setValueAtTime(0, 0);
        hatSrc.connect(hatFilter).connect(hatGain).connect(master);
        hatSrc.start(0);

        for (let sec = 0; sec < 6; sec++) {
            const seg = SEGMENTS[sec];
            const t0 = sec * SECTION_LEN;
            const beatsPerSection = Math.floor(SECTION_LEN / beatLen);
            if (seg.kick) {
                for (let b = 0; b < beatsPerSection; b++) {
                    if (b % 4 !== 0 && b % 4 !== 2) continue;
                    const t = t0 + b * beatLen;
                    kickOsc.frequency.setValueAtTime(120, t);
                    kickOsc.frequency.exponentialRampToValueAtTime(35, t + 0.07);
                    kickGain.gain.setValueAtTime(0, t);
                    kickGain.gain.linearRampToValueAtTime(0.5 * seg.volume, t + 0.004);
                    kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                }
            }
            if (seg.snare) {
                for (let b = 0; b < beatsPerSection; b++) {
                    if (b % 4 !== 1 && b % 4 !== 3) continue;
                    const t = t0 + b * beatLen;
                    snareGain.gain.setValueAtTime(0, t);
                    snareGain.gain.linearRampToValueAtTime(0.18 * seg.volume, t + 0.002);
                    snareGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
                }
            }
            if (seg.hat) {
                const stepsPerSection = Math.floor(SECTION_LEN / (beatLen / 2));
                for (let i = 0; i < stepsPerSection; i++) {
                    if (i % 2 === 0) continue;
                    const t = t0 + i * (beatLen / 2);
                    hatGain.gain.setValueAtTime(0, t);
                    hatGain.gain.linearRampToValueAtTime(0.07 * seg.volume, t + 0.001);
                    hatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
                }
            }
        }

        const buffer = await ctx.startRendering();
        return buffer;
    }

    // ─────────────────────────────────────────────────
    // Playback
    // ─────────────────────────────────────────────────
    async playMenu(): Promise<void> {
        if (this._menuPlaying) return;
        await this.init();
        this.stopLevel();
        const ctx = this.context();
        if (!ctx || !this.master || !this.menuBuffer) return;
        this.stopMenu();
        this._menuPlaying = true;
        this.menuSource = ctx.createBufferSource();
        this.menuSource.buffer = this.menuBuffer;
        this.menuSource.loop = true;
        this.menuSource.connect(this.master);
        const targetGain = this.muted ? 0 : 0.35;
        this.master.gain.setValueAtTime(0, ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 2.0);
        this.menuSource.start(0);
    }

    stopMenu(): void {
        this._menuPlaying = false;
        if (this.master && this.ctx) {
            this.master.gain.cancelScheduledValues(this.ctx.currentTime);
            this.master.gain.setValueAtTime(this.muted ? 0 : 0.35, this.ctx.currentTime);
        }
        if (this.menuSource) {
            try { this.menuSource.stop(); } catch { /* already stopped */ }
            this.menuSource?.disconnect();
            this.menuSource = null;
        }
    }

    async playLevel(): Promise<void> {
        if (this._levelPlaying) return;
        await this.init();
        this.stopMenu();
        const ctx = this.context();
        if (!ctx || !this.master || !this.levelBuffer) return;
        this.stopLevel();
        this._levelPlaying = true;
        this._levelPaused = false;
        this.lastSeekTick = 0;
        this.pausedOffset = 0;
        this.levelSource = ctx.createBufferSource();
        this.levelSource.buffer = this.levelBuffer;
        this.levelSource.loop = false;
        this.levelSource.connect(this.master);
        this.levelSource.start(0, 0);
        this.sourceStartedAt = ctx.currentTime;
    }

    /**
     * Sync level playback to the current timeline tick. While paused
     * (see pauseLevel()), this is a no-op — the buffer source stays
     * frozen at the tick pauseLevel() captured it at, so the music
     * genuinely stops advancing rather than silently drifting on.
     */
    seekLevel(tick: number): void {
    if (!this._levelPlaying || this._levelPaused || !this.ctx || !this.master || !this.levelBuffer)
        return;
    const snapped = Math.round(tick);
    if (snapped === this.lastSeekTick && this.levelSource) return;
    const offset = (snapped / 3600) * 60;
    const clampedOffset = Math.max(0, Math.min(offset, 59.99));
    // If a source is already playing and roughly where it should be for
    // normal forward (or reverse) playback, leave it running rather than
    // restarting it every frame -- that's what was causing the crackling.
    // Only force a hard reseek when the drift between where the source
    // should be and where it actually is has grown large (e.g. scrub,
    // pause/resume, or a big timeline jump).
    if (this.levelSource) {
        const expectedElapsed = this.ctx.currentTime - this.sourceStartedAt;
        const drift = Math.abs(expectedElapsed - clampedOffset);
        this.lastSeekTick = snapped;
        if (drift < 0.2) return;
        try { this.levelSource.stop(); } catch { /* already stopped */ }
        this.levelSource.disconnect();
    } else {
        this.lastSeekTick = snapped;
    }
    this.levelSource = this.ctx.createBufferSource();
    this.levelSource.buffer = this.levelBuffer;
    this.levelSource.loop = false;
    this.levelSource.connect(this.master);
    this.levelSource.start(0, clampedOffset);
    this.sourceStartedAt = this.ctx.currentTime - clampedOffset;
}
    /**
     * Freeze the level track at its current position. Actually stops
     * the underlying buffer source (rather than just leaving seekLevel
     * un-called), since a started AudioBufferSourceNode keeps playing
     * in real wall-clock time regardless of whether the game timeline
     * is advancing.
     */
    pauseLevel(): void {
        if (!this._levelPlaying || this._levelPaused) return;
        this._levelPaused = true;
        this.pausedOffset = (Math.max(0, this.lastSeekTick) / 3600) * 60;
        if (this.levelSource) {
            try { this.levelSource.stop(); } catch { /* already stopped */ }
            this.levelSource?.disconnect();
            this.levelSource = null;
        }
    }

    /** Resume the level track from wherever pauseLevel() froze it. */
    resumeLevel(): void {
        if (!this._levelPlaying || !this._levelPaused) return;
        this._levelPaused = false;
        if (!this.ctx || !this.master || !this.levelBuffer) return;
        this.levelSource = this.ctx.createBufferSource();
        this.levelSource.buffer = this.levelBuffer;
        this.levelSource.loop = false;
        this.levelSource.connect(this.master);
        this.levelSource.start(0, Math.max(0, Math.min(this.pausedOffset, 59.99)));
        this.sourceStartedAt = this.ctx.currentTime - Math.max(0, Math.min(this.pausedOffset, 59.99));
    }

    stopLevel(): void {
        this._levelPlaying = false;
        this._levelPaused = false;
        if (this.levelSource) {
            try { this.levelSource.stop(); } catch { /* already stopped */ }
            this.levelSource?.disconnect();
            this.levelSource = null;
        }
    }

    stop(): void {
        this.stopMenu();
        this.stopLevel();
    }

    toggleMute(): boolean {
        this.muted = !this.muted;
        localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
        if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
        return this.muted;
    }
}

export const music = new Music();
