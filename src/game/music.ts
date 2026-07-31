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

    // ────────────────────────────────────────────────────────────────
    //  MENU TRACK  —  "Chronosphere"
    // ────────────────────────────────────────────────────────────────
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

    // ────────────────────────────────────────────────────────────────
    //  LEVEL TRACK  —  "Timeline"
    //  Exactly 60 s, built in 6 sections of 10 s each.
    //
    //  0-10 s   Groove established: bass + kick + detuned pad from bar 1
    //  10-20 s  Arpeggio joins, hi-hat on off-beats
    //  20-30 s  Lead melody enters (filtered square)
    //  30-40 s  Chord change, more dissonance, snare added
    //  40-50 s  Full climax — all layers at peak
    //  50-60 s  Tension peak, then strip back to pad + bass for resolution
    // ────────────────────────────────────────────────────────────────
    private async renderLevel(): Promise<AudioBuffer> {
        const sr = 44100;
        const dur = 60;
        const len = sr * dur;
        const ctx = new OfflineAudioContext(2, len, sr);

        // ── EDITABLE PARAMETERS ───────────────────────────────────────
        const BPM = 128;
        const SECTION_LEN = 10;

        const PAD_DETUNE_CT = 8;
        const PAD_CHORDS: number[][] = [
            [Hz.E2, Hz.B2, Hz.G3, Hz.B3],
            [Hz.E2, Hz.B2, Hz.G3, Hz.B3],
            [Hz.D2, Hz.A2, Hz.Fs3, Hz.A3],
            [Hz.C2, Hz.G2, Hz.E3, Hz.G3],
            [Hz.E2, Hz.Fs2, Hz.B2, Hz.Eb3],
            [Hz.E2, Hz.B2, Hz.G3, Hz.B3],
        ];
        const PAD_VOLUMES = [0.22, 0.22, 0.24, 0.26, 0.30, 0.20];
        const PAD_FILTER_FREQS = [600, 800, 1000, 1200, 1600, 700];

        const BASS_PATTERNS: number[][] = [
            [Hz.E2, Hz.E2, Hz.G2, Hz.B2],
            [Hz.E2, Hz.E2, Hz.G2, Hz.B2],
            [Hz.D2, Hz.D2, Hz.A2, Hz.Fs2],
            [Hz.C2, Hz.C2, Hz.G2, Hz.E2],
            [Hz.E2, Hz.Fs2, Hz.G2, Hz.Fs2],
            [Hz.E2, Hz.E2, Hz.B2, Hz.E2],
        ];
        const BASS_VOLUME = 0.55;
        const BASS_DECAY = 0.40;

        const ARP_PATTERNS: number[][] = [
            [Hz.E4, Hz.G4, Hz.B4, Hz.E5, Hz.B4, Hz.G4, Hz.E4, Hz.G4],
            [Hz.E4, Hz.G4, Hz.B4, Hz.E5, Hz.B4, Hz.G4, Hz.E4, Hz.G4],
            [Hz.D4, Hz.Fs4, Hz.A4, Hz.D5, Hz.A4, Hz.Fs4, Hz.D4, Hz.Fs4],
            [Hz.C4, Hz.E4, Hz.G4, Hz.C5, Hz.G4, Hz.E4, Hz.C4, Hz.E4],
            [Hz.E4, Hz.Fs4, Hz.B4, Hz.E5, Hz.B4, Hz.Fs4, Hz.E4, Hz.Fs4],
            [Hz.E4, Hz.G4, Hz.B4, Hz.E5, Hz.B4, Hz.G4, Hz.E4, Hz.G4],
        ];
        const ARP_VOLUMES = [0, 0.18, 0.20, 0.22, 0.25, 0.16];

        const KICK_VOLUME = 0.55;
        const KICK_FREQ_START = 120;
        const KICK_FREQ_END = 35;

        const SNARE_VOLUMES = [0, 0, 0, 0.18, 0.22, 0.18];

        const HAT_VOLUMES = [0, 0.06, 0.07, 0.08, 0.10, 0.07];
        const HAT_CUTOFF = 7000;

        const LEAD_VOLUMES = [0, 0, 0.18, 0.22, 0.28, 0.20];
        const LEAD_FILTER_FREQ = 1800;
        const LEAD_NOTES: number[] = [
            Hz.Fs5, Hz.E5, Hz.D5, Hz.A4, Hz.D5, Hz.Fs5, Hz.A5, Hz.Fs5,
            Hz.G5, Hz.Fs5, Hz.E5, Hz.D5, Hz.E5, Hz.D5, Hz.Cs5, Hz.D5,
            Hz.E5, Hz.G5, Hz.C5, Hz.E5, Hz.G5, Hz.E5, Hz.D5, Hz.C5,
            Hz.B4, Hz.C5, Hz.D5, Hz.E5, Hz.G5, Hz.E5, Hz.C5, Hz.B4,
            Hz.B5, Hz.A5, Hz.Fs5, Hz.E5, Hz.Fs5, Hz.Ab5, Hz.B5, Hz.Fs5,
            Hz.E5, Hz.Fs5, Hz.B5, Hz.A5, Hz.Ab5, Hz.Fs5, Hz.E5, Hz.Eb5,
            Hz.E5, Hz.B4, Hz.G4, Hz.E4, Hz.G4, Hz.B4, Hz.E5, Hz.D5,
            Hz.B4, Hz.G4, Hz.E4, Hz.G4, Hz.B4, Hz.E5, Hz.G5, Hz.E5,
        ];
        // ── END EDITABLE PARAMETERS ───────────────────────────────────

        const beatLen = 60 / BPM;
        const beatsPerSection = SECTION_LEN / beatLen;
        const sixteenthLen = beatLen / 4;

        const master = ctx.createGain();
        master.gain.setValueAtTime(0.18, 0);
        master.connect(ctx.destination);

        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.Q.setValueAtTime(0.7, 0);
        padFilter.frequency.setValueAtTime(PAD_FILTER_FREQS[0], 0);
        for (let sec = 0; sec < 6; sec++) {
            padFilter.frequency.linearRampToValueAtTime(
                PAD_FILTER_FREQS[sec], sec * SECTION_LEN + 0.1
            );
        }
        padFilter.connect(master);

        for (let sec = 0; sec < 6; sec++) {
            const t0 = sec * SECTION_LEN;
            const chord = PAD_CHORDS[sec];
            const vol = PAD_VOLUMES[sec] / chord.length;
            for (const f of chord) {
                for (const dt of [-PAD_DETUNE_CT, 0, PAD_DETUNE_CT]) {
                    const osc = ctx.createOscillator();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(f, 0);
                    osc.detune.setValueAtTime(dt, 0);
                    const v = ctx.createGain();
                    v.gain.setValueAtTime(0, Math.max(0, t0 - 0.05));
                    v.gain.linearRampToValueAtTime(vol, t0 + 0.3);
                    v.gain.setValueAtTime(vol, t0 + SECTION_LEN - 0.3);
                    v.gain.linearRampToValueAtTime(0, t0 + SECTION_LEN);
                    osc.connect(v).connect(padFilter);
                    osc.start(0);
                    osc.stop(dur);
                }
            }
        }

        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = 'lowpass';
        bassFilter.frequency.setValueAtTime(400, 0);
        bassFilter.Q.setValueAtTime(1.2, 0);

        const bassGain = ctx.createGain();
        bassGain.gain.setValueAtTime(0, 0);
        const bassOsc = ctx.createOscillator();
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.setValueAtTime(Hz.E2, 0);
        bassOsc.connect(bassFilter).connect(bassGain).connect(master);
        bassOsc.start(0);
        bassOsc.stop(dur);

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0, 0);
        const subOsc = ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(Hz.E2 / 2, 0);
        subOsc.connect(subGain).connect(master);
        subOsc.start(0);
        subOsc.stop(dur);

        for (let sec = 0; sec < 6; sec++) {
            const t0 = sec * SECTION_LEN;
            const pattern = BASS_PATTERNS[sec];
            for (let beat = 0; beat < beatsPerSection; beat++) {
                const t = t0 + beat * beatLen;
                const note = pattern[beat % pattern.length];
                bassOsc.frequency.setValueAtTime(note, t);
                subOsc.frequency.setValueAtTime(note / 2, t);
                bassGain.gain.setValueAtTime(0, t);
                bassGain.gain.linearRampToValueAtTime(BASS_VOLUME * 0.6, t + 0.006);
                bassGain.gain.linearRampToValueAtTime(0, t + beatLen * BASS_DECAY);
                subGain.gain.setValueAtTime(0, t);
                subGain.gain.linearRampToValueAtTime(BASS_VOLUME * 0.5, t + 0.010);
                subGain.gain.linearRampToValueAtTime(0, t + beatLen * BASS_DECAY * 1.2);
            }
        }

        const kickGain = ctx.createGain();
        kickGain.gain.setValueAtTime(0, 0);
        const kickOsc = ctx.createOscillator();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(KICK_FREQ_START, 0);
        kickOsc.connect(kickGain).connect(master);
        kickOsc.start(0);
        kickOsc.stop(dur);

        for (let beat = 0; beat < Math.floor(dur / beatLen); beat++) {
            if (beat % 4 !== 0 && beat % 4 !== 2) continue;
            const t = beat * beatLen;
            kickOsc.frequency.setValueAtTime(KICK_FREQ_START, t);
            kickOsc.frequency.exponentialRampToValueAtTime(KICK_FREQ_END, t + 0.07);
            kickGain.gain.setValueAtTime(0, t);
            kickGain.gain.linearRampToValueAtTime(KICK_VOLUME, t + 0.004);
            kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        }

        const snareNoiseBuf = ctx.createBuffer(1, sr * dur, sr);
        const snd = snareNoiseBuf.getChannelData(0);
        for (let i = 0; i < snd.length; i++) snd[i] = Math.random() * 2 - 1;
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

        for (let sec = 3; sec < 6; sec++) {
            const vol = SNARE_VOLUMES[sec];
            if (vol === 0) continue;
            const t0 = sec * SECTION_LEN;
            for (let beat = 0; beat < beatsPerSection; beat++) {
                if (beat % 4 !== 1 && beat % 4 !== 3) continue;
                const t = t0 + beat * beatLen;
                snareGain.gain.setValueAtTime(0, t);
                snareGain.gain.linearRampToValueAtTime(vol, t + 0.002);
                snareGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            }
        }

        const hatNoiseBuf = ctx.createBuffer(1, sr * dur, sr);
        const hnd = hatNoiseBuf.getChannelData(0);
        for (let i = 0; i < hnd.length; i++) hnd[i] = Math.random() * 2 - 1;
        const hatSrc = ctx.createBufferSource();
        hatSrc.buffer = hatNoiseBuf;
        const hatFilter = ctx.createBiquadFilter();
        hatFilter.type = 'highpass';
        hatFilter.frequency.setValueAtTime(HAT_CUTOFF, 0);
        hatFilter.Q.setValueAtTime(0.5, 0);
        const hatGain = ctx.createGain();
        hatGain.gain.setValueAtTime(0, 0);
        hatSrc.connect(hatFilter).connect(hatGain).connect(master);
        hatSrc.start(0);

        for (let sec = 1; sec < 6; sec++) {
            const vol = HAT_VOLUMES[sec];
            if (vol === 0) continue;
            const t0 = sec * SECTION_LEN;
            const stepsPerSection = Math.floor(SECTION_LEN / (beatLen / 2));
            for (let i = 0; i < stepsPerSection; i++) {
                if (i % 2 === 0) continue;
                const t = t0 + i * (beatLen / 2);
                hatGain.gain.setValueAtTime(0, t);
                hatGain.gain.linearRampToValueAtTime(vol, t + 0.001);
                hatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
            }
        }

        const arpGain = ctx.createGain();
        arpGain.gain.setValueAtTime(0, 0);
        const arpOsc = ctx.createOscillator();
        arpOsc.type = 'triangle';
        arpOsc.frequency.setValueAtTime(Hz.E4, 0);
        const arpFilter = ctx.createBiquadFilter();
        arpFilter.type = 'lowpass';
        arpFilter.frequency.setValueAtTime(3000, 0);
        arpOsc.connect(arpFilter).connect(arpGain).connect(master);
        arpOsc.start(0);
        arpOsc.stop(dur);

        for (let sec = 1; sec < 6; sec++) {
            const vol = ARP_VOLUMES[sec];
            if (vol === 0) continue;
            const t0 = sec * SECTION_LEN;
            const pattern = ARP_PATTERNS[sec];
            const stepCount = Math.floor(SECTION_LEN / sixteenthLen);
            for (let i = 0; i < stepCount; i++) {
                const t = t0 + i * sixteenthLen;
                arpOsc.frequency.setValueAtTime(pattern[i % pattern.length], t);
                arpGain.gain.setValueAtTime(0, t);
                arpGain.gain.linearRampToValueAtTime(vol, t + 0.003);
                arpGain.gain.linearRampToValueAtTime(0, t + sixteenthLen * 0.55);
            }
        }

        const leadGain = ctx.createGain();
        leadGain.gain.setValueAtTime(0, 0);
        const leadOsc = ctx.createOscillator();
        leadOsc.type = 'square';
        leadOsc.frequency.setValueAtTime(Hz.E5, 0);
        const leadFilter = ctx.createBiquadFilter();
        leadFilter.type = 'lowpass';
        leadFilter.frequency.setValueAtTime(LEAD_FILTER_FREQ, 0);
        leadFilter.Q.setValueAtTime(1.0, 0);
        leadOsc.connect(leadFilter).connect(leadGain).connect(master);
        leadOsc.start(0);
        leadOsc.stop(dur);

        let leadNoteIdx = 0;
        for (let sec = 2; sec < 6; sec++) {
            const vol = LEAD_VOLUMES[sec];
            if (vol === 0) { leadNoteIdx += Math.floor(beatsPerSection); continue; }
            const t0 = sec * SECTION_LEN;
            const notesThisSection = Math.floor(beatsPerSection);
            for (let i = 0; i < notesThisSection; i++) {
                const t = t0 + i * beatLen;
                const note = LEAD_NOTES[leadNoteIdx % LEAD_NOTES.length];
                leadOsc.frequency.setValueAtTime(note, t);
                leadGain.gain.setValueAtTime(0, t);
                leadGain.gain.linearRampToValueAtTime(vol, t + 0.006);
                leadGain.gain.linearRampToValueAtTime(vol * 0.6, t + beatLen * 0.6);
                leadGain.gain.linearRampToValueAtTime(0, t + beatLen - 0.03);
                leadNoteIdx++;
            }
        }

        const buffer = await ctx.startRendering();
        return buffer;
    }

    // ────────────────────────────────────────────────────────────────
    //  Playback
    // ────────────────────────────────────────────────────────────────

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
        this.lastSeekTick = 0;
        this.levelSource = ctx.createBufferSource();
        this.levelSource.buffer = this.levelBuffer;
        this.levelSource.loop = false;
        this.levelSource.connect(this.master);
        this.levelSource.start(0, 0);
    }

    seekLevel(tick: number): void {
        if (!this._levelPlaying || !this.ctx || !this.master || !this.levelBuffer)
            return;
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
