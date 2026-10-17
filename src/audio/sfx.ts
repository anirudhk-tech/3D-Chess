type FilterSpec = { type: BiquadFilterType; freq: number; endFreq?: number; q?: number };

interface ToneSpec {
  freq: number;
  endFreq?: number;
  type?: OscillatorType;
  duration: number;
  gain: number;
  when?: number;
  attack?: number;
  filter?: FilterSpec;
}

interface NoiseSpec {
  duration: number;
  gain: number;
  when?: number;
  filter?: FilterSpec;
}

export type StepKind = 'boot' | 'hoof' | 'heavy' | 'cloth';

export class SoundBoard {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  muted = false;

  unlock() {
    if (!this.ctx) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      this.ctx = new Context();
      const compressor = this.ctx.createDynamicsCompressor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(compressor).connect(this.ctx.destination);
      this.noise = this.buildNoise(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private get ready() {
    return !!this.ctx && !!this.master && !this.muted && this.ctx.state === 'running';
  }

  private applyFilter(ctx: AudioContext, spec: FilterSpec, start: number, end: number): BiquadFilterNode {
    const filter = ctx.createBiquadFilter();
    filter.type = spec.type;
    filter.Q.value = spec.q ?? 1;
    filter.frequency.setValueAtTime(spec.freq, start);
    if (spec.endFreq) filter.frequency.exponentialRampToValueAtTime(spec.endFreq, end);
    return filter;
  }

  private envelope(ctx: AudioContext, start: number, duration: number, peak: number, attack: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    return gain;
  }

  private tone(spec: ToneSpec) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const start = ctx.currentTime + (spec.when ?? 0);
    const end = start + spec.duration;
    const osc = ctx.createOscillator();
    osc.type = spec.type ?? 'sine';
    osc.frequency.setValueAtTime(spec.freq, start);
    if (spec.endFreq) osc.frequency.exponentialRampToValueAtTime(spec.endFreq, end);
    const gain = this.envelope(ctx, start, spec.duration, spec.gain, spec.attack ?? 0.005);
    let node: AudioNode = osc;
    if (spec.filter) {
      const filter = this.applyFilter(ctx, spec.filter, start, end);
      osc.connect(filter);
      node = filter;
    }
    node.connect(gain).connect(this.master!);
    osc.start(start);
    osc.stop(end + 0.05);
  }

  private burst(spec: NoiseSpec) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const start = ctx.currentTime + (spec.when ?? 0);
    const end = start + spec.duration;
    const source = ctx.createBufferSource();
    source.buffer = this.noise!;
    source.loop = true;
    const gain = this.envelope(ctx, start, spec.duration, spec.gain, 0.004);
    let node: AudioNode = source;
    if (spec.filter) {
      const filter = this.applyFilter(ctx, spec.filter, start, end);
      source.connect(filter);
      node = filter;
    }
    node.connect(gain).connect(this.master!);
    source.start(start, Math.random());
    source.stop(end + 0.05);
  }

  footstep(kind: StepKind) {
    if (kind === 'boot') {
      this.burst({ duration: 0.08, gain: 0.22, filter: { type: 'lowpass', freq: 700 } });
      this.tone({ freq: 130, endFreq: 60, duration: 0.08, gain: 0.14 });
    } else if (kind === 'hoof') {
      for (const when of [0, 0.07]) {
        this.burst({ duration: 0.04, gain: 0.22, when, filter: { type: 'bandpass', freq: 1800, q: 2 } });
        this.tone({ freq: 220, endFreq: 120, duration: 0.05, gain: 0.1, when });
      }
    } else if (kind === 'heavy') {
      this.tone({ freq: 55, endFreq: 35, duration: 0.25, gain: 0.5 });
      this.burst({ duration: 0.3, gain: 0.3, filter: { type: 'lowpass', freq: 220 } });
    } else {
      this.burst({ duration: 0.12, gain: 0.05, filter: { type: 'highpass', freq: 3000 } });
    }
  }

  whoosh() {
    this.burst({ duration: 0.28, gain: 0.3, filter: { type: 'bandpass', freq: 400, endFreq: 1800, q: 1 } });
  }

  clash() {
    this.burst({ duration: 0.08, gain: 0.5, filter: { type: 'highpass', freq: 3000 } });
    this.tone({ freq: 180, endFreq: 60, type: 'square', duration: 0.1, gain: 0.2 });
    [1200, 1870, 2650].forEach((freq, i) => {
      this.tone({ freq: freq * (1 + i * 0.002), duration: 0.45, gain: 0.12 });
    });
  }

  ramSlam() {
    this.tone({ freq: 70, endFreq: 28, duration: 0.6, gain: 0.9 });
    this.burst({ duration: 0.5, gain: 0.6, filter: { type: 'lowpass', freq: 400 } });
    this.burst({ duration: 0.1, gain: 0.5, filter: { type: 'bandpass', freq: 900, q: 1 } });
  }

  grunt() {
    this.tone({
      freq: 220,
      endFreq: 90,
      type: 'sawtooth',
      duration: 0.25,
      gain: 0.15,
      filter: { type: 'bandpass', freq: 700, q: 2 },
    });
  }

  thud() {
    this.tone({ freq: 110, endFreq: 38, duration: 0.35, gain: 0.7 });
    this.burst({ duration: 0.2, gain: 0.4, filter: { type: 'lowpass', freq: 300 } });
  }

  sink() {
    this.burst({ duration: 0.6, gain: 0.25, filter: { type: 'lowpass', freq: 250, endFreq: 80 } });
  }

  rumble() {
    this.tone({ freq: 45, endFreq: 38, type: 'sawtooth', duration: 0.35, gain: 0.5, filter: { type: 'lowpass', freq: 150 } });
    this.burst({ duration: 0.3, gain: 0.3, filter: { type: 'lowpass', freq: 180 } });
  }

  whinny() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, start);
    osc.frequency.linearRampToValueAtTime(900, start + 0.18);
    osc.frequency.linearRampToValueAtTime(700, start + 0.4);
    osc.frequency.linearRampToValueAtTime(380, start + 0.7);
    const vibrato = ctx.createOscillator();
    const vibratoDepth = ctx.createGain();
    vibrato.frequency.value = 16;
    vibratoDepth.gain.value = 30;
    vibrato.connect(vibratoDepth).connect(osc.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 3;
    const gain = this.envelope(ctx, start, 0.75, 0.25, 0.04);
    osc.connect(filter).connect(gain).connect(this.master!);
    osc.start(start);
    vibrato.start(start);
    osc.stop(start + 0.8);
    vibrato.stop(start + 0.8);
  }

  check() {
    const brass = { type: 'lowpass' as const, freq: 900 };
    this.tone({ freq: 220, type: 'sawtooth', duration: 0.5, gain: 0.25, filter: brass, attack: 0.03 });
    this.tone({ freq: 330, type: 'sawtooth', duration: 0.7, gain: 0.25, filter: brass, attack: 0.03, when: 0.35 });
  }

  checkmate() {
    [0, 0.5, 1].forEach((when) => this.tone({ freq: 80, endFreq: 40, duration: 0.4, gain: 0.8, when }));
    [110, 176, 253, 330, 411].forEach((freq) => this.tone({ freq, duration: 3, gain: 0.2, when: 1.2, attack: 0.01 }));
  }

  promotion() {
    [523, 659, 784, 1047].forEach((freq, i) =>
      this.tone({ freq, type: 'triangle', duration: 0.35, gain: 0.2, when: i * 0.09 }),
    );
  }
}
