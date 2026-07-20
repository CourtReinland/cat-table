/**
 * AudioManager — WebAudio graph with bus volumes, mp3/wav buffers when
 * available, and procedural synth fallbacks for every sound so the game
 * is fully playable even with zero audio assets on disk.
 */

type BusName = 'music' | 'sfx' | 'voice';

interface PlayOpts {
  vol?: number;
  rate?: number;
  pan?: number; // -1..1
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private buses!: Record<BusName, GainNode>;
  private master!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private missing = new Set<string>();
  private musicNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private fallbackMusic: { stop: () => void } | null = null;
  private currentMusic: string | null = null;
  private voiceGain!: GainNode;
  volumes = { master: 0.9, music: 0.7, sfx: 0.9, voice: 1.0 };

  /** must be called from a user gesture at least once */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.buses = {
        music: this.ctx.createGain(),
        sfx: this.ctx.createGain(),
        voice: this.ctx.createGain(),
      };
      for (const b of Object.values(this.buses)) b.connect(this.master);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready() {
    return !!this.ctx;
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.buses.music.gain.value = this.volumes.music;
    this.buses.sfx.gain.value = this.volumes.sfx;
    this.buses.voice.gain.value = this.volumes.voice;
  }

  async load(urls: string[]) {
    if (!this.ctx) return;
    await Promise.all(
      urls.map(async (url) => {
        if (this.buffers.has(url) || this.missing.has(url)) return;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(url, buf);
        } catch {
          this.missing.add(url);
        }
      }),
    );
  }

  private playBuffer(url: string, bus: BusName, opts: PlayOpts = {}): AudioBufferSourceNode | null {
    const buf = this.buffers.get(url);
    if (!this.ctx || !buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = opts.vol ?? 1;
    src.connect(gain);
    if (opts.pan && this.ctx.createStereoPanner) {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = opts.pan;
      gain.connect(pan).connect(this.buses[bus]);
    } else {
      gain.connect(this.buses[bus]);
    }
    src.start();
    return src;
  }

  /** Play a named sound effect; falls back to synth when the file is missing. */
  sfx(kind: string, opts: PlayOpts = {}) {
    if (!this.ctx) return;
    const file = `assets/audio/sfx/${kind}.mp3`;
    if (this.buffers.has(file)) {
      const rate = opts.rate ?? 0.94 + Math.random() * 0.12;
      this.playBuffer(file, 'sfx', { ...opts, rate });
      return;
    }
    this.synth(kind, opts);
  }

  meow(mood: 'cute' | 'sassy' | 'triumph' = 'cute') {
    this.sfx(`meow-${mood}`, { vol: 0.9 });
  }

  /** Play a voice line; resolves when done (or immediately if missing). */
  voice(url: string | undefined): Promise<void> {
    if (!this.ctx || !url || !this.buffers.has(url)) return Promise.resolve();
    return new Promise((resolve) => {
      const src = this.playBuffer(url, 'voice', { vol: 1 });
      if (!src) return resolve();
      src.onended = () => resolve();
    });
  }

  /** Loop music by name ('title' | 'play' | 'cuddle'), crossfading from previous. */
  music(name: 'title' | 'play' | 'cuddle' | null) {
    if (!this.ctx || this.currentMusic === name) return;
    this.currentMusic = name;
    const t = this.ctx.currentTime;

    if (this.musicNodes) {
      const old = this.musicNodes;
      old.gain.gain.linearRampToValueAtTime(0, t + 1.2);
      setTimeout(() => {
        try {
          old.src.stop();
        } catch {
          /* already stopped */
        }
      }, 1400);
      this.musicNodes = null;
    }
    if (this.fallbackMusic) {
      this.fallbackMusic.stop();
      this.fallbackMusic = null;
    }
    if (!name) return;

    const url = `assets/audio/music/${name}.mp3`;
    if (this.buffers.has(url)) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.get(url)!;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.8, t + 1.5);
      src.connect(gain).connect(this.buses.music);
      src.start();
      this.musicNodes = { src, gain };
    } else {
      this.fallbackMusic = this.proceduralMusic(name);
    }
  }

  // ── procedural fallback synths ────────────────────────────────────────────

  private synth(kind: string, opts: PlayOpts) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.buses.sfx;
    const vol = opts.vol ?? 0.8;

    const noise = (dur: number, filterFreq: number, type: BiquadFilterType, peak: number) => {
      const len = Math.floor(this.ctx!.sampleRate * dur);
      const buf = this.ctx!.createBuffer(1, len, this.ctx!.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.5;
      const src = this.ctx!.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx!.createBiquadFilter();
      filt.type = type;
      filt.frequency.value = filterFreq;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(peak * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filt).connect(g).connect(out);
      src.start(t);
    };

    const tone = (freq0: number, freq1: number, dur: number, peak: number, type: OscillatorType = 'sine') => {
      const o = this.ctx!.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t + dur);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(peak * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    };

    switch (kind) {
      case 'shatter-glass':
        noise(0.5, 5200, 'highpass', 0.7);
        tone(2800 + Math.random() * 900, 1600, 0.35, 0.16, 'triangle');
        tone(3900, 2400, 0.22, 0.1, 'sine');
        break;
      case 'shatter-ceramic':
        noise(0.4, 1600, 'bandpass', 0.9);
        tone(700, 240, 0.3, 0.3, 'triangle');
        break;
      case 'smash-grand':
        noise(0.9, 900, 'lowpass', 1.1);
        tone(420, 120, 0.8, 0.4, 'sawtooth');
        tone(2600, 900, 0.5, 0.12, 'triangle');
        break;
      case 'clatter-metal':
        noise(0.25, 3200, 'bandpass', 0.5);
        tone(1900, 700, 0.16, 0.14, 'square');
        break;
      case 'thud-soft':
        noise(0.3, 300, 'lowpass', 0.8);
        tone(140, 60, 0.25, 0.5);
        break;
      case 'whoosh':
        noise(0.22, 900, 'bandpass', 0.28);
        break;
      case 'meow-cute':
        tone(620, 980, 0.14, 0.22, 'sawtooth');
        setTimeout(() => tone(980, 540, 0.22, 0.2, 'sawtooth'), 120);
        break;
      case 'meow-sassy':
        tone(500, 1050, 0.3, 0.24, 'sawtooth');
        setTimeout(() => tone(900, 380, 0.4, 0.22, 'sawtooth'), 260);
        break;
      case 'meow-triumph':
        tone(700, 1400, 0.18, 0.24, 'sawtooth');
        setTimeout(() => tone(1400, 1200, 0.3, 0.2, 'sawtooth'), 160);
        break;
      case 'purr': {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 52;
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 24;
        const lfoG = this.ctx.createGain();
        lfoG.gain.value = 0.5;
        const g = this.ctx.createGain();
        g.gain.value = 0.12 * vol;
        lfo.connect(lfoG).connect(g.gain);
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 300;
        o.connect(f).connect(g).connect(out);
        o.start(t);
        lfo.start(t);
        o.stop(t + 2.2);
        lfo.stop(t + 2.2);
        break;
      }
      case 'ui-pop':
        tone(880, 1320, 0.09, 0.18, 'triangle');
        break;
      case 'heart-pop':
        tone(1200, 1800, 0.12, 0.14, 'sine');
        break;
      case 'success':
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => tone(f, f, 0.5, 0.16, 'triangle'), i * 110),
        );
        break;
      default:
        noise(0.2, 1000, 'bandpass', 0.3);
    }
  }

  /** Tiny generative music box — used when no music files exist. */
  private proceduralMusic(kind: 'title' | 'play' | 'cuddle') {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const out = this.buses.music;
    let alive = true;
    const master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(out);

    const scales: Record<string, { root: number; notes: number[]; tempo: number; pluck: number }> = {
      title: { root: 220, notes: [0, 3, 7, 10, 12, 15], tempo: 1400, pluck: 0.16 },
      play: { root: 196, notes: [0, 2, 3, 7, 9, 12], tempo: 420, pluck: 0.12 },
      cuddle: { root: 262, notes: [0, 4, 7, 11, 12], tempo: 900, pluck: 0.14 },
    };
    const cfg = scales[kind];

    const pluck = (freq: number, when: number, vol: number, dur = 1.6) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vol, when + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
      o.connect(g).connect(master);
      o.start(when);
      o.stop(when + dur + 0.1);
    };

    let step = 0;
    const schedule = () => {
      if (!alive) return;
      const t = ctx.currentTime + 0.05;
      const semi = cfg.notes[Math.floor(Math.random() * cfg.notes.length)];
      const oct = Math.random() < 0.3 ? 2 : 1;
      pluck(cfg.root * Math.pow(2, semi / 12) * oct, t, cfg.pluck);
      if (kind === 'play' && step % 4 === 0) pluck(cfg.root / 2, t, 0.2, 1.0); // bass
      if (kind !== 'play' && step % 6 === 0) pluck(cfg.root / 2, t, 0.12, 2.5); // pad root
      step++;
      timer = window.setTimeout(schedule, cfg.tempo * (0.9 + Math.random() * 0.2));
    };
    let timer = window.setTimeout(schedule, 60);

    return {
      stop: () => {
        alive = false;
        clearTimeout(timer);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
        setTimeout(() => master.disconnect(), 1000);
      },
    };
  }
}

export const audio = new AudioManager();
