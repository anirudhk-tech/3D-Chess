interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  endFreq?: number;
  q?: number;
}

type Bus = 'main' | 'ambient';

interface RouteSpec {
  bus?: Bus;
  pan?: number;
}

interface ToneSpec extends RouteSpec {
  freq: number;
  endFreq?: number;
  type?: OscillatorType;
  duration: number;
  gain: number;
  when?: number;
  attack?: number;
  filter?: FilterSpec;
}

interface NoiseSpec extends RouteSpec {
  duration: number;
  gain: number;
  when?: number;
  filter?: FilterSpec;
}

const BED_LEVEL = 0.07;
const AMBIENT_LEVEL = 0.5;
const DUCKED_AMBIENT_LEVEL = AMBIENT_LEVEL * 0.1;
const DUCK_TIME_CONSTANT = 0.15;
const MUTE_TIME_CONSTANT = 0.05;
const MASTER_LEVEL = 0.6;
const NOISE_SECONDS = 2;
const SILENT_GAIN = 0.0001;
const STOP_PADDING = 0.05;
const DEFAULT_TONE_ATTACK = 0.005;
const BURST_ATTACK = 0.004;

export type StepKind = 'boot' | 'hoof' | 'heavy' | 'cloth';

interface SourceChain {
  output: GainNode;
  nodes: AudioNode[];
}

interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  ambientBus: GainNode;
  output: GainNode;
  noise: AudioBuffer;
  bed?: GainNode;
}

interface AudioScope {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function ignoreResumeRejection() {
  return undefined;
}

function findAudioContextConstructor() {
  const scope: AudioScope = window;
  return scope.AudioContext ?? scope.webkitAudioContext;
}

export class SoundBoard {
  private graph?: AudioGraph;
  private mutedState = false;
  private duckedState = false;

  get muted() {
    return this.mutedState;
  }

  get running() {
    return this.graph?.ctx.state === 'running';
  }

  duck(ducked: boolean) {
    this.duckedState = ducked;
    if (!this.graph) return;
    this.graph.ambientBus.gain.setTargetAtTime(
      this.ambientLevel,
      this.graph.ctx.currentTime,
      DUCK_TIME_CONSTANT,
    );
  }

  setMuted(muted: boolean) {
    this.mutedState = muted;
    if (!this.graph) return;
    this.graph.output.gain.setTargetAtTime(
      this.outputLevel,
      this.graph.ctx.currentTime,
      MUTE_TIME_CONSTANT,
    );
  }

  unlock() {
    let graph = this.graph;
    if (!graph) {
      const Context = findAudioContextConstructor();
      if (!Context) return;
      graph = this.build(new Context());
    }
    const { ctx } = graph;
    if (ctx.state !== 'running' && ctx.state !== 'closed') {
      ctx.resume().catch(ignoreResumeRejection);
    }
  }

  private get ambientLevel() {
    return this.duckedState ? DUCKED_AMBIENT_LEVEL : AMBIENT_LEVEL;
  }

  private get outputLevel() {
    return this.mutedState ? 0 : 1;
  }

  private build(ctx: AudioContext): AudioGraph {
    const compressor = ctx.createDynamicsCompressor();
    const output = ctx.createGain();
    output.gain.value = this.outputLevel;
    const master = ctx.createGain();
    master.gain.value = MASTER_LEVEL;
    const ambientBus = ctx.createGain();
    ambientBus.gain.value = this.ambientLevel;
    master.connect(compressor);
    ambientBus.connect(compressor);
    compressor.connect(output).connect(ctx.destination);
    const graph: AudioGraph = { ctx, master, ambientBus, output, noise: this.buildNoise(ctx) };
    this.graph = graph;
    return graph;
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private readyGraph(): AudioGraph | undefined {
    const graph = this.graph;
    if (!graph || this.mutedState || graph.ctx.state !== 'running') return undefined;
    return graph;
  }

  private route(graph: AudioGraph, node: AudioNode, spec: RouteSpec, nodes: AudioNode[]) {
    let tail: AudioNode = node;
    if (spec.pan !== undefined) {
      const panner = graph.ctx.createStereoPanner();
      panner.pan.value = spec.pan;
      tail.connect(panner);
      nodes.push(panner);
      tail = panner;
    }
    tail.connect(spec.bus === 'ambient' ? graph.ambientBus : graph.master);
  }

  private createFilter(
    graph: AudioGraph,
    spec: FilterSpec,
    start: number,
    end: number,
  ): BiquadFilterNode {
    const filter = graph.ctx.createBiquadFilter();
    filter.type = spec.type;
    filter.Q.value = spec.q ?? 1;
    filter.frequency.setValueAtTime(spec.freq, start);
    if (spec.endFreq) filter.frequency.exponentialRampToValueAtTime(spec.endFreq, end);
    return filter;
  }

  private envelope(
    graph: AudioGraph,
    start: number,
    duration: number,
    peak: number,
    attack: number,
  ): GainNode {
    const gain = graph.ctx.createGain();
    gain.gain.setValueAtTime(SILENT_GAIN, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, start + duration);
    return gain;
  }

  private connectChain(
    graph: AudioGraph,
    source: AudioScheduledSourceNode,
    spec: ToneSpec | NoiseSpec,
    start: number,
    attack: number,
  ): SourceChain {
    const nodes: AudioNode[] = [source];
    let tail: AudioNode = source;
    if (spec.filter) {
      const filter = this.createFilter(graph, spec.filter, start, start + spec.duration);
      source.connect(filter);
      nodes.push(filter);
      tail = filter;
    }
    const output = this.envelope(graph, start, spec.duration, spec.gain, attack);
    tail.connect(output);
    nodes.push(output);
    this.route(graph, output, spec, nodes);
    return { output, nodes };
  }

  private playUntil(source: AudioScheduledSourceNode, stopAt: number, nodes: AudioNode[]) {
    source.onended = () => {
      source.onended = null;
      for (const node of nodes) node.disconnect();
    };
    source.stop(stopAt + STOP_PADDING);
  }

  tone(spec: ToneSpec) {
    const graph = this.readyGraph();
    if (graph) this.playTone(graph, spec);
  }

  burst(spec: NoiseSpec) {
    const graph = this.readyGraph();
    if (graph) this.playBurst(graph, spec);
  }

  private playTone(graph: AudioGraph, spec: ToneSpec) {
    const { ctx } = graph;
    const start = ctx.currentTime + (spec.when ?? 0);
    const end = start + spec.duration;
    const osc = ctx.createOscillator();
    osc.type = spec.type ?? 'sine';
    osc.frequency.setValueAtTime(spec.freq, start);
    if (spec.endFreq) osc.frequency.exponentialRampToValueAtTime(spec.endFreq, end);
    const { nodes } = this.connectChain(
      graph,
      osc,
      spec,
      start,
      spec.attack ?? DEFAULT_TONE_ATTACK,
    );
    osc.start(start);
    this.playUntil(osc, end, nodes);
  }

  private playBurst(graph: AudioGraph, spec: NoiseSpec) {
    const { ctx } = graph;
    const start = ctx.currentTime + (spec.when ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = graph.noise;
    source.loop = true;
    const { nodes } = this.connectChain(graph, source, spec, start, BURST_ATTACK);
    source.start(start, Math.random());
    this.playUntil(source, start + spec.duration, nodes);
  }

  footstep(kind: StepKind) {
    if (kind === 'boot') {
      this.burst({ duration: 0.08, gain: 0.22, filter: { type: 'lowpass', freq: 700 } });
      this.tone({ freq: 130, endFreq: 60, duration: 0.08, gain: 0.14 });
    } else if (kind === 'hoof') {
      for (const when of [0, 0.07]) {
        this.burst({
          duration: 0.04,
          gain: 0.22,
          when,
          filter: { type: 'bandpass', freq: 1800, q: 2 },
        });
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
    this.burst({
      duration: 0.28,
      gain: 0.3,
      filter: { type: 'bandpass', freq: 400, endFreq: 1800, q: 1 },
    });
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
    this.tone({
      freq: 45,
      endFreq: 38,
      type: 'sawtooth',
      duration: 0.35,
      gain: 0.5,
      filter: { type: 'lowpass', freq: 150 },
    });
    this.burst({ duration: 0.3, gain: 0.3, filter: { type: 'lowpass', freq: 180 } });
  }

  whinny() {
    const graph = this.readyGraph();
    if (!graph) return;
    const { ctx } = graph;
    const start = ctx.currentTime;
    const nodes: AudioNode[] = [];
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
    nodes.push(osc, vibrato, vibratoDepth);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 3;
    const gain = this.envelope(graph, start, 0.75, 0.25, 0.04);
    osc.connect(filter).connect(gain).connect(graph.master);
    nodes.push(filter, gain);
    osc.start(start);
    vibrato.start(start);
    vibrato.stop(start + 0.75 + STOP_PADDING);
    this.playUntil(osc, start + 0.75, nodes);
  }

  check() {
    const brass = { type: 'lowpass' as const, freq: 900 };
    this.tone({
      freq: 220,
      type: 'sawtooth',
      duration: 0.5,
      gain: 0.25,
      filter: brass,
      attack: 0.03,
    });
    this.tone({
      freq: 330,
      type: 'sawtooth',
      duration: 0.7,
      gain: 0.25,
      filter: brass,
      attack: 0.03,
      when: 0.35,
    });
  }

  checkmate() {
    [0, 0.5, 1].forEach((when) => {
      this.tone({ freq: 80, endFreq: 40, duration: 0.4, gain: 0.8, when });
    });
    [110, 176, 253, 330, 411].forEach((freq) => {
      this.tone({ freq, duration: 3, gain: 0.2, when: 1.2, attack: 0.01 });
    });
  }

  promotion() {
    [523, 659, 784, 1047].forEach((freq, i) => {
      this.tone({ freq, type: 'triangle', duration: 0.35, gain: 0.2, when: i * 0.09 });
    });
  }

  startBed() {
    const graph = this.graph;
    if (!graph || graph.bed) return;
    const { ctx } = graph;
    const bed = ctx.createGain();
    bed.gain.value = BED_LEVEL;
    bed.connect(graph.ambientBus);
    graph.bed = bed;

    const layers: {
      type: BiquadFilterType;
      freq: number;
      q: number;
      level: number;
      lfoRate: number;
    }[] = [
      { type: 'bandpass', freq: 350, q: 0.6, level: 1, lfoRate: 0.13 },
      { type: 'lowpass', freq: 160, q: 0.7, level: 1.4, lfoRate: 0.07 },
      { type: 'bandpass', freq: 1400, q: 0.8, level: 0.35, lfoRate: 0.21 },
    ];
    for (const layer of layers) {
      const source = ctx.createBufferSource();
      source.buffer = graph.noise;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = layer.type;
      filter.frequency.value = layer.freq;
      filter.Q.value = layer.q;
      const level = ctx.createGain();
      level.gain.value = layer.level;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = layer.lfoRate;
      const depth = ctx.createGain();
      depth.gain.value = layer.level * 0.4;
      lfo.connect(depth).connect(level.gain);
      source.connect(filter).connect(level).connect(bed);
      source.start(0, Math.random());
      lfo.start();
    }
  }

  distantClash(pan: number, volume: number) {
    const hits = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < hits; i++) {
      const when = i * (0.08 + Math.random() * 0.12);
      const route = { bus: 'ambient' as const, pan };
      this.burst({
        duration: 0.06,
        gain: volume,
        when,
        filter: { type: 'highpass', freq: 2500 },
        ...route,
      });
      for (const base of [1500, 2300, 3100]) {
        this.tone({
          freq: base * (0.9 + Math.random() * 0.25),
          duration: 0.25,
          gain: volume * 0.25,
          when,
          filter: { type: 'lowpass', freq: 4500 },
          ...route,
        });
      }
    }
  }

  shout(pan: number, volume: number, pitch: number) {
    const graph = this.readyGraph();
    if (!graph) return;
    const { ctx } = graph;
    const start = ctx.currentTime;
    const duration = 0.45 + Math.random() * 0.4;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch, start);
    osc.frequency.linearRampToValueAtTime(pitch * 1.35, start + duration * 0.35);
    osc.frequency.linearRampToValueAtTime(pitch * 0.8, start + duration);
    const envelope = this.envelope(graph, start, duration, volume, duration * 0.2);
    const nodes: AudioNode[] = [osc, envelope];
    for (const formant of [700, 1250]) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = formant;
      filter.Q.value = 5;
      osc.connect(filter).connect(envelope);
      nodes.push(filter);
    }
    this.route(graph, envelope, { bus: 'ambient', pan }, nodes);
    osc.start(start);
    this.playUntil(osc, start + duration, nodes);
    this.playBurst(graph, {
      duration,
      gain: volume * 0.5,
      filter: { type: 'bandpass', freq: 1500, q: 1 },
      bus: 'ambient',
      pan,
    });
  }

  drum(pan: number, volume: number) {
    for (const when of [0, 0.45]) {
      this.tone({ freq: 95, endFreq: 45, duration: 0.4, gain: volume, when, bus: 'ambient', pan });
      this.burst({
        duration: 0.15,
        gain: volume * 0.4,
        when,
        filter: { type: 'lowpass', freq: 250 },
        bus: 'ambient',
        pan,
      });
    }
  }

  horn(pan: number, volume: number) {
    this.tone({
      freq: 146,
      endFreq: 155,
      type: 'sawtooth',
      duration: 2,
      gain: volume,
      attack: 0.35,
      filter: { type: 'lowpass', freq: 650 },
      bus: 'ambient',
      pan,
    });
  }
}
