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

// ──────────────────────────────────────────────────────────────────
// Pitch reference (equal temperament, A4 = 440 Hz)
// ──────────────────────────────────────────────────────────────────
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

    get isMuted(): boolean {
        return this.muted;
    }

    /** Unlock the audio context (call from a user gesture).
     *  Creates the context eagerly so it starts in a running state, or resumes
     *  an existing suspended context. */
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

    /** Pre-render both tracks. Call once after user interaction. */
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

    // ────────────────────────────────────────────────────────────────
    //  MENU TRACK  —  "Chronosphere"
    //  Looping ambient / arpeggiated piece, ~16 s.
    // ────────────────────────────────────────────────────────────────
    private async renderMenu(): Promise<AudioBuffer> {
        const sr = 44100;
        const dur = 16; // seconds
        const len = sr * dur;
        const ctx = new OfflineAudioContext(2, len, sr);

        // ── EDITABLE PARAMETERS ───────────────────────────────────────
        const BPM = 110;
        const PAD_NOTES = [Hz.C3, Hz.G3, Hz.Bb3, Hz.Eb4]; // Cm7
        const PAD_WAVE: OscillatorType = 'sawtooth';
        const PAD_DETUNE_CT = 6; // cents
        const PAD_VOLUME = 1;
        const PAD_FILTER_CUTOFF = 900;
        const PAD_FILTER_LFO_DEPTH = 350;
        const PAD_FILTER_LFO_RATE = 0.12;

        const BASS_PATTERN = [Hz.C2, Hz.G2, Hz.Bb2, Hz.G2];
        const BASS_VOLUME = 0.45;
        const BASS_DECAY = 0.40; // fraction of beat

        // Two alternating 8-note phrases for variety; total pattern = 16 notes
        const ARP_PHRASE_A = [Hz.C4, Hz.Eb4, Hz.G4, Hz.Bb4, Hz.C5, Hz.Bb4, Hz.G4, Hz.Eb4];
        const ARP_PHRASE_B = [Hz.G4, Hz.Bb4, Hz.Eb5, Hz.D5, Hz.C5, Hz.G4, Hz.Eb4, Hz.C4];
        const ARP_NOTES = [...ARP_PHRASE_A, ...ARP_PHRASE_B];
        const ARP_WAVE: OscillatorType = 'triangle';
        const ARP_RATE = BPM / 60 * 4; // 16th notes
        const ARP_VOLUME = 6;
        // Per-note velocity to add organic variation (indexed by position in 16-note pattern)
        const ARP_VELOCITIES = [0.14, 0.09, 0.12, 0.08, 0.14, 0.10, 0.11, 0.08,
            0.11, 0.08, 0.14, 0.10, 0.12, 0.09, 0.08, 0.13];

        const NOISE_VOLUME = 0.0042;
        const NOISE_FILTER_FREQ = 2200;
        // ── END EDITABLE PARAMETERS ───────────────────────────────────

        const beatLen = 60 / BPM;

        // Master
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.55, 0);
        master.connect(ctx.destination);

        // ── Pad ───────────────────────────────────────────────────────
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

        // ── Bass ──────────────────────────────────────────────────────
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

        // ── Arpeggio ──────────────────────────────────────────────────
        const arpGain = ctx.createGain();
        arpGain.gain.setValueAtTime(0, 0);
        const arpOsc = ctx.createOscillator();
        arpOsc.type = ARP_WAVE;
        arpOsc.frequency.setValueAtTime(ARP_NOTES[0], 0);
        arpOsc.connect(arpGain).connect(master);
        arpOsc.start(0);
        arpOsc.stop(dur);

        const stepLen = 1 / ARP_RATE;
        const arpPatLen = ARP_NOTES.length; // 16
        // Round totalSteps down to a multiple of the pattern length so the
        // arpeggio always completes a full phrase at the loop boundary.
        const totalSteps = Math.ceil(dur * ARP_RATE);
        for (let i = 0; i < totalSteps; i++) {
            const t = i * stepLen;
            const noteIdx = i % arpPatLen;
            arpOsc.frequency.setValueAtTime(ARP_NOTES[noteIdx], t);
            const vel = ARP_VOLUME * ARP_VELOCITIES[noteIdx];
            arpGain.gain.setValueAtTime(0, t);
            arpGain.gain.linearRampToValueAtTime(vel, t + 0.004);
            arpGain.gain.linearRampToValueAtTime(0, t + stepLen * 0.65);
        }

        // ── Noise texture ─────────────────────────────────────────────
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

    // ────────────────────────────────────────────────────────────────
    //  LEVEL TRACK  —  "Timeline"
    //  Exactly 60 s, built in 6 sections of 10 s each.
    //
    //  0-10 s   Ambient pad (E minor)
    //  10-20 s  Bass enters
    //  20-30 s  Arpeggio + kick drum
    //  30-40 s  Hi-hat + lead melody
    //  40-50 s  Full climax
    //  50-60 s  Peak tension, then release
    // ────────────────────────────────────────────────────────────────
    private async renderLevel(): Promise<AudioBuffer> {
        const sr = 44100;
        const dur = 60; // seconds (exactly one timeline)
        const len = sr * dur;
        const ctx = new OfflineAudioContext(2, len, sr);

        // ── EDITABLE PARAMETERS ───────────────────────────────────────
        const BPM = 120;
        const SECTION_LEN = 10; // seconds per section

        // Pad: warm sawtooth, slow filter sweep
        const PAD_WAVE: OscillatorType = 'sawtooth';
        const PAD_VOLUMES = [0.04, 0.05, 0.06, 0.07, 0.09, 0.08];
        const PAD_NOTES_BY_SECTION: number[][] = [
            [Hz.E3, Hz.G3, Hz.B3],                    // Em
            [Hz.E3, Hz.G3, Hz.B3, Hz.D4],             // Em7
            [Hz.E3, Hz.G3, Hz.B3, Hz.D4, Hz.Fs4],     // Em9
            [Hz.E3, Hz.G3, Hz.B3, Hz.D4],             // Em7
            [Hz.E3, Hz.G3, Hz.B3, Hz.D4, Hz.Fs4],     // Em9
            [Hz.E3, Hz.G3, Hz.B3, Hz.D4],             // Em7
        ];
        const PAD_FILTER_START = 400;
        const PAD_FILTER_MID = 1200;
        const PAD_FILTER_PEAK = 1800;
        const PAD_FILTER_END = 700;
        const PAD_FILTER_LFO_RATE = 0.15;
        const PAD_FILTER_LFO_DEPTH = 200;

        // Bass: sine, quarter notes
        const BASS_WAVE: OscillatorType = 'sine';
        const BASS_VOLUMES = [0, 0.08, 0.10, 0.12, 0.14, 0.12];
        const BASS_PATTERNS: number[][] = [
            [Hz.E2, Hz.B2, Hz.G2, Hz.A2],
            [Hz.E2, Hz.B2, Hz.G2, Hz.A2],
            [Hz.E2, Hz.B2, Hz.G2, Hz.A2],
            [Hz.E2, Hz.B2, Hz.G2, Hz.A2],
            [Hz.E2, Hz.B2, Hz.G2, Hz.A2],
            [Hz.E2, Hz.E2, Hz.E2, Hz.E2],
        ];
        const BASS_DECAY = 0.35;

        // Arpeggio: triangle, 8th notes, entering at section 3
        const ARP_WAVE: OscillatorType = 'triangle';
        const ARP_VOLUMES = [0, 0, 0.03, 0.04, 0.05, 0.04];
        const ARP_PATTERNS: number[][] = [
            [Hz.E4, Hz.G4, Hz.B4, Hz.E5, Hz.B4, Hz.G4, Hz.E4, Hz.G4],
            [Hz.E4, Hz.G4, Hz.B4, Hz.D5, Hz.B4, Hz.G4, Hz.E4, Hz.G4],
            [Hz.E4, Hz.G4, Hz.B4, Hz.D5, Hz.Fs5, Hz.D5, Hz.B4, Hz.G4],
            [Hz.E4, Hz.G4, Hz.B4, Hz.D5, Hz.B4, Hz.G4, Hz.E4, Hz.G4],
            [Hz.E4, Hz.G4, Hz.B4, Hz.D5, Hz.Fs5, Hz.G5, Hz.Fs5, Hz.D5],
            [Hz.E4, Hz.G4, Hz.B4, Hz.E5, Hz.B4, Hz.G4, Hz.E4, Hz.G4],
        ];

        // Kick: sine blip, on half notes, entering at section 3
        const KICK_VOLUMES = [0, 0, 0.06, 0.08, 0.10, 0.09];
        const KICK_FREQ = 80;

        // Hi-hat: filtered noise, 8th notes, entering at section 4
        const HAT_VOLUMES = [0, 0, 0, 0.02, 0.03, 0.025];
        const HAT_CUTOFF = 8000;

        // Lead melody: square wave + low-pass, entering at section 4
        const LEAD_WAVE: OscillatorType = 'square';
        const LEAD_VOLUMES = [0, 0, 0, 0.035, 0.05, 0.045];
        const LEAD_FILTER = 1200;
        const LEAD_MELODY = [
            Hz.E5, Hz.G5, Hz.B5, Hz.G5, Hz.E5, Hz.D5, Hz.C5, Hz.D5,
            Hz.E5, Hz.G5, Hz.B5, Hz.D6, Hz.C6, Hz.B5, Hz.G5, Hz.E5,
            Hz.E5, Hz.G5, Hz.B5, Hz.G5, Hz.E5, Hz.Fs5, Hz.G5, Hz.A5,
            Hz.B5, Hz.G5, Hz.E5, Hz.D5, Hz.C5, Hz.D5, Hz.E5, Hz.C5,
        ];
        const LEAD_NOTE_LEN = 60 / BPM * 2; // half notes
        // ── END EDITABLE PARAMETERS ───────────────────────────────────

        const beatLen = 60 / BPM;
        const beatsPerSection = SECTION_LEN / beatLen; // 20
        const arpStep = beatLen / 2;

        // Master limiter
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.45, 0);
        master.connect(ctx.destination);

        // ── Pad ───────────────────────────────────────────────────────
        const padGain = ctx.createGain();
        padGain.gain.setValueAtTime(0, 0);
        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.Q.setValueAtTime(0.5, 0);
        padFilter.frequency.setValueAtTime(PAD_FILTER_START, 0);
        padFilter.frequency.linearRampToValueAtTime(PAD_FILTER_MID, 20);
        padFilter.frequency.linearRampToValueAtTime(PAD_FILTER_PEAK, 40);
        padFilter.frequency.linearRampToValueAtTime(PAD_FILTER_END, 60);
        padGain.connect(padFilter).connect(master);

        const padLfo = ctx.createOscillator();
        padLfo.type = 'sine';
        padLfo.frequency.setValueAtTime(PAD_FILTER_LFO_RATE, 0);
        const padLfoGain = ctx.createGain();
        padLfoGain.gain.setValueAtTime(PAD_FILTER_LFO_DEPTH, 0);
        padLfo.connect(padLfoGain).connect(padFilter.frequency);
        padLfo.start(0);
        padLfo.stop(dur);

        for (let sec = 0; sec < 6; sec++) {
            const t0 = sec * SECTION_LEN;
            const vol = PAD_VOLUMES[sec];
            for (const f of PAD_NOTES_BY_SECTION[sec]) {
                const osc = ctx.createOscillator();
                osc.type = PAD_WAVE;
                osc.frequency.setValueAtTime(f, 0);
                const v = ctx.createGain();
                v.gain.setValueAtTime(0, t0);
                v.gain.setValueAtTime(vol, t0 + 0.05);
                osc.connect(v).connect(padGain);
                osc.start(0);
                osc.stop(dur);
            }
        }

        // ── Bass ──────────────────────────────────────────────────────
        const bassGain = ctx.createGain();
        bassGain.gain.setValueAtTime(0, 0);
        const bassOsc = ctx.createOscillator();
        bassOsc.type = BASS_WAVE;
        bassOsc.frequency.setValueAtTime(Hz.E2, 0);
        bassOsc.connect(bassGain).connect(master);
        bassOsc.start(0);
        bassOsc.stop(dur);

        for (let sec = 0; sec < 6; sec++) {
            const t0 = sec * SECTION_LEN;
            const pattern = BASS_PATTERNS[sec];
            const vol = BASS_VOLUMES[sec];
            for (let beat = 0; beat < beatsPerSection; beat++) {
                const t = t0 + beat * beatLen;
                bassOsc.frequency.setValueAtTime(pattern[beat % pattern.length], t);
                bassGain.gain.setValueAtTime(0, t);
                bassGain.gain.linearRampToValueAtTime(vol, t + 0.008);
                bassGain.gain.linearRampToValueAtTime(0, t + beatLen * BASS_DECAY);
            }
        }

        // ── Arpeggio ──────────────────────────────────────────────────
        const arpGain = ctx.createGain();
        arpGain.gain.setValueAtTime(0, 0);
        const arpOsc = ctx.createOscillator();
        arpOsc.type = ARP_WAVE;
        arpOsc.frequency.setValueAtTime(Hz.E4, 0);
        arpOsc.connect(arpGain).connect(master);
        arpOsc.start(0);
        arpOsc.stop(dur);

        for (let sec = 0; sec < 6; sec++) {
            const t0 = sec * SECTION_LEN;
            const pattern = ARP_PATTERNS[sec];
            const vol = ARP_VOLUMES[sec];
            if (vol === 0) continue;
            const steps = SECTION_LEN / arpStep;
            for (let i = 0; i < steps; i++) {
                const t = t0 + i * arpStep;
                arpOsc.frequency.setValueAtTime(pattern[i % pattern.length], t);
                arpGain.gain.setValueAtTime(0, t);
                arpGain.gain.linearRampToValueAtTime(vol, t + 0.004);
                arpGain.gain.linearRampToValueAtTime(0, t + arpStep * 0.35);
            }
        }

        // ── Kick ──────────────────────────────────────────────────────
        const kickGain = ctx.createGain();
        kickGain.gain.setValueAtTime(0, 0);
        const kickOsc = ctx.createOscillator();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(KICK_FREQ, 0);
        kickOsc.connect(kickGain).connect(master);
        kickOsc.start(0);
        kickOsc.stop(dur);

        for (let sec = 0; sec < 6; sec++) {
            const t0 = sec * SECTION_LEN;
            const vol = KICK_VOLUMES[sec];
            if (vol === 0) continue;
            for (let beat = 0; beat < beatsPerSection; beat += 2) {
                const t = t0 + beat * beatLen;
                kickOsc.frequency.setValueAtTime(KICK_FREQ, t);
                kickOsc.frequency.exponentialRampToValueAtTime(30, t + 0.08);
                kickGain.gain.setValueAtTime(0, t);
                kickGain.gain.linearRampToValueAtTime(vol, t + 0.004);
                kickGain.gain.linearRampToValueAtTime(0, t + 0.1);
            }
        }

        // ── Hi-hat ────────────────────────────────────────────────────
        const hatLen = sr * dur;
        const hatBuf = ctx.createBuffer(1, hatLen, sr);
        const hd = hatBuf.getChannelData(0);
        for (let i = 0; i < hatLen; i++) hd[i] = Math.random() * 2 - 1;
        const hatSrc = ctx.createBufferSource();
        hatSrc.buffer = hatBuf;
        const hatFilter = ctx.createBiquadFilter();
        hatFilter.type = 'highpass';
        hatFilter.frequency.setValueAtTime(HAT_CUTOFF, 0);
        hatFilter.Q.setValueAtTime(0.5, 0);
        const hatGain = ctx.createGain();
        hatGain.gain.setValueAtTime(0, 0);
        hatSrc.connect(hatFilter).connect(hatGain).connect(master);
        hatSrc.start(0);

        for (let sec = 0; sec < 6; sec++) {
            const t0 = sec * SECTION_LEN;
            const vol = HAT_VOLUMES[sec];
            if (vol === 0) continue;
            const steps = SECTION_LEN / arpStep;
            for (let i = 0; i < steps; i++) {
                if (i % 2 === 0) continue; // off-beats only
                const t = t0 + i * arpStep;
                hatGain.gain.setValueAtTime(0, t);
                hatGain.gain.linearRampToValueAtTime(vol, t + 0.001);
                hatGain.gain.linearRampToValueAtTime(0, t + 0.04);
            }
        }

        // ── Lead ──────────────────────────────────────────────────────
        const leadGain = ctx.createGain();
        leadGain.gain.setValueAtTime(0, 0);
        const leadOsc = ctx.createOscillator();
        leadOsc.type = LEAD_WAVE;
        leadOsc.frequency.setValueAtTime(Hz.E5, 0);
        const leadFilter = ctx.createBiquadFilter();
        leadFilter.type = 'lowpass';
        leadFilter.frequency.setValueAtTime(LEAD_FILTER, 0);
        leadOsc.connect(leadFilter).connect(leadGain).connect(master);
        leadOsc.start(0);
        leadOsc.stop(dur);

        for (let sec = 0; sec < 6; sec++) {
            const t0 = sec * SECTION_LEN;
            const vol = LEAD_VOLUMES[sec];
            if (vol === 0) continue;
            const notes = SECTION_LEN / LEAD_NOTE_LEN;
            for (let i = 0; i < notes; i++) {
                const t = t0 + i * LEAD_NOTE_LEN;
                const idx = (sec * 8 + i * 2) % LEAD_MELODY.length;
                leadOsc.frequency.setValueAtTime(LEAD_MELODY[idx], t);
                leadGain.gain.setValueAtTime(0, t);
                leadGain.gain.linearRampToValueAtTime(vol, t + 0.008);
                leadGain.gain.linearRampToValueAtTime(vol * 0.5, t + LEAD_NOTE_LEN * 0.75);
                leadGain.gain.linearRampToValueAtTime(0, t + LEAD_NOTE_LEN - 0.05);
            }
        }

        const buffer = await ctx.startRendering();
        return buffer;
    }

    // ────────────────────────────────────────────────────────────────
    //  Playback
    // ────────────────────────────────────────────────────────────────

    /** Start looping menu music. Stops any level music first. */
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
        this.menuSource.start(0);
    }

    stopMenu(): void {
        this._menuPlaying = false;
        if (this.menuSource) {
            try { this.menuSource.stop(); } catch { /* already stopped */ }
            this.menuSource?.disconnect();
            this.menuSource = null;
        }
    }

    /** Start level music from the beginning. Stops any menu music first. */
    async playLevel(): Promise<void> {
        if (this._levelPlaying) return;
        await this.init();
        this.stopMenu();
        const ctx = this.context();
        if (!ctx || !this.master || !this.levelBuffer) return;
        this.stopLevel();
        this._levelPlaying = true;
        this.lastSeekTick = 0;
        this.levelSource = ctx.createBufferSource();
        this.levelSource.buffer = this.levelBuffer;
        this.levelSource.loop = false;
        this.levelSource.connect(this.master);
        this.levelSource.start(0, 0);
    }

    /**
     * Seek the level music to match a timeline position.
     * `tick` is 0-3600, mapped to 0-60 seconds of audio.
     * Throttled: only re-creates the buffer source when the tick actually changes.
     */
    seekLevel(tick: number): void {
        if (!this._levelPlaying || !this.ctx || !this.master || !this.levelBuffer)
            return;
        // Round to nearest tick to avoid micro-seeks on floating-point drift.
        const snapped = Math.round(tick);
        if (snapped === this.lastSeekTick && this.levelSource) return;
        this.lastSeekTick = snapped;
        const offset = (snapped / 3600) * 60;
        if (this.levelSource) {
            try { this.levelSource.stop(); } catch { /* already stopped */ }
            this.levelSource?.disconnect();
        }
        this.levelSource = this.ctx.createBufferSource();
        this.levelSource.buffer = this.levelBuffer;
        this.levelSource.loop = false;
        this.levelSource.connect(this.master);
        this.levelSource.start(0, Math.max(0, Math.min(offset, 59.99)));
    }

    stopLevel(): void {
        this._levelPlaying = false;
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
