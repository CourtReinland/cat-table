/** Procedural ASMR + optional ElevenLabs clips */

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private musicGain: GainNode | null = null;
  private musicOscs: OscillatorNode[] = [];
  private musicStarted = false;
  private voiceEl: HTMLAudioElement | null = null;

  private ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.08;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  startAmbience() {
    if (this.musicStarted || this.muted) return;
    const ctx = this.ensure();
    if (!this.musicGain) return;
    this.musicStarted = true;

    // Soft mysterious pads
    const notes = [110, 138.59, 164.81, 207.65];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      g.gain.value = 0.12 / notes.length;
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.value = 0.08 + i * 0.03;
      lfoG.gain.value = 0.04;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      osc.connect(g);
      g.connect(this.musicGain!);
      osc.start();
      lfo.start();
      this.musicOscs.push(osc, lfo);
    });
  }

  /** Satisfying glass/ceramic crash ASMR */
  playShatter(kind: 'glass' | 'ceramic' | 'soft' | 'metal' = 'glass') {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!this.master) return;
    const now = ctx.currentTime;

    // Noise burst
    const bufferSize = ctx.sampleRate * 0.35;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const env = Math.pow(1 - t, kind === 'soft' ? 2 : 1.2);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = kind === 'metal' ? 'highpass' : 'bandpass';
    noiseFilter.frequency.value = kind === 'glass' ? 3200 : kind === 'ceramic' ? 1800 : kind === 'metal' ? 2400 : 800;
    noiseFilter.Q.value = kind === 'glass' ? 0.7 : 1.2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(kind === 'soft' ? 0.25 : 0.45, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start(now);

    // Tonal pings (glass ring)
    if (kind === 'glass' || kind === 'ceramic') {
      const freqs = kind === 'glass' ? [2400, 3600, 5100] : [900, 1400, 2100];
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, now);
        o.frequency.exponentialRampToValueAtTime(f * 0.7, now + 0.4);
        g.gain.setValueAtTime(0.12 / (i + 1), now + i * 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + i * 0.05);
        o.connect(g);
        g.connect(this.master!);
        o.start(now);
        o.stop(now + 0.6);
      });
    }

    // Low thud
    const thud = ctx.createOscillator();
    const tg = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(120, now);
    thud.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    tg.gain.setValueAtTime(0.35, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    thud.connect(tg);
    tg.connect(this.master);
    thud.start(now);
    thud.stop(now + 0.2);
  }

  playNudge() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!this.master) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(90, now + 0.08);
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    o.connect(g);
    g.connect(this.master);
    o.start(now);
    o.stop(now + 0.12);
  }

  playMeow() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!this.master) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, now);
    o.frequency.linearRampToValueAtTime(680, now + 0.12);
    o.frequency.linearRampToValueAtTime(380, now + 0.28);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 4;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.1, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(now);
    o.stop(now + 0.4);
  }

  playUI() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!this.master) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(660, now);
    o.frequency.exponentialRampToValueAtTime(990, now + 0.08);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    o.connect(g);
    g.connect(this.master);
    o.start(now);
    o.stop(now + 0.16);
  }

  playSuccess() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!this.master) return;
    const now = ctx.currentTime;
    ;[523, 659, 784, 1046].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, now + i * 0.08);
      g.gain.linearRampToValueAtTime(0.08, now + i * 0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);
      o.connect(g);
      g.connect(this.master!);
      o.start(now + i * 0.08);
      o.stop(now + i * 0.08 + 0.4);
    });
  }

  /** Play an ElevenLabs (or any) mp3 line; stops previous VO */
  playVoice(url: string | undefined | null) {
    if (!url || this.muted) return;
    try {
      if (this.voiceEl) {
        this.voiceEl.pause();
        this.voiceEl = null;
      }
      const el = new Audio(url);
      el.volume = 0.9;
      void el.play().catch(() => {});
      this.voiceEl = el;
      this.ensure(); // resume audio context alongside HTML audio
    } catch {
      /* ignore */
    }
  }

  stopVoice() {
    if (this.voiceEl) {
      this.voiceEl.pause();
      this.voiceEl = null;
    }
  }
}

export const audio = new AudioManager();
