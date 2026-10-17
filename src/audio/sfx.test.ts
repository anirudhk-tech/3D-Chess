import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundBoard } from './sfx';

type State = 'suspended' | 'running' | 'interrupted';

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
}

class FakeNode {
  disconnect = vi.fn();
  onended: (() => void) | null = null;
  type = '';
  buffer: unknown = null;
  loop = false;
  gain = new FakeParam();
  frequency = new FakeParam();
  pan = new FakeParam();
  Q = new FakeParam();
  connect<T>(target: T): T {
    return target;
  }
  start = vi.fn();
  stop = vi.fn();
}

class FakeContext {
  static instances: FakeContext[] = [];
  state: State = 'suspended';
  currentTime = 0;
  sampleRate = 100;
  destination = new FakeNode();
  created: FakeNode[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  constructor() {
    FakeContext.instances.push(this);
  }
  private make() {
    const node = new FakeNode();
    this.created.push(node);
    return node;
  }
  createGain = () => this.make();
  createOscillator = () => this.make();
  createBufferSource = () => this.make();
  createBiquadFilter = () => this.make();
  createStereoPanner = () => this.make();
  createDynamicsCompressor = () => this.make();
  createBuffer = (_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  });
}

const context = () => FakeContext.instances[0]!;

describe('SoundBoard', () => {
  beforeEach(() => {
    FakeContext.instances = [];
    vi.stubGlobal('window', { AudioContext: FakeContext });
  });
  afterEach(() => vi.unstubAllGlobals());

  function unlocked() {
    const board = new SoundBoard();
    board.unlock();
    return board;
  }

  it('stays silent until the context is running', () => {
    const board = unlocked();
    context().state = 'suspended';
    const before = context().created.length;
    board.clash();
    expect(context().created.length).toBe(before);
  });

  it('resumes a suspended or interrupted context on every unlock', () => {
    const board = unlocked();
    expect(context().resume).toHaveBeenCalledTimes(1);
    context().state = 'interrupted';
    board.unlock();
    expect(context().resume).toHaveBeenCalledTimes(2);
    board.unlock();
    expect(context().resume).toHaveBeenCalledTimes(2);
  });

  it('survives a rejected resume', async () => {
    const board = new SoundBoard();
    board.unlock();
    context().resume.mockRejectedValueOnce(new Error('blocked'));
    context().state = 'suspended';
    expect(() => {
      board.unlock();
    }).not.toThrow();
    await Promise.resolve();
  });

  it('disconnects every node of a tone once its source ends', async () => {
    const board = unlocked();
    await Promise.resolve();
    const baseline = context().created.length;
    board.tone({
      freq: 440,
      duration: 0.1,
      gain: 0.2,
      pan: 0.5,
      filter: { type: 'lowpass', freq: 900 },
    });
    const nodes = context().created.slice(baseline);
    expect(nodes.length).toBeGreaterThanOrEqual(4);
    expect(nodes.every((node) => node.disconnect.mock.calls.length === 0)).toBe(true);
    nodes[0]!.onended?.();
    expect(nodes.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it('disconnects every node of a noise burst and the whinny once they end', async () => {
    const board = unlocked();
    await Promise.resolve();
    for (const play of [
      () => {
        board.burst({ duration: 0.1, gain: 0.2 });
      },
      () => {
        board.whinny();
      },
      () => {
        board.shout(0, 0.1, 150);
      },
    ]) {
      const baseline = context().created.length;
      play();
      const nodes = context().created.slice(baseline);
      const sources = nodes.filter((node) => node.onended);
      expect(sources.length).toBeGreaterThan(0);
      sources.forEach((source) => source.onended?.());
      for (const node of nodes.filter((n) => n.start.mock.calls.length === 0)) {
        expect(node.disconnect).toHaveBeenCalled();
      }
    }
  });

  it('mutes through the output stage and stops scheduling sounds', async () => {
    const board = unlocked();
    await Promise.resolve();
    board.setMuted(true);
    expect(board.muted).toBe(true);
    const outputGains = context().created.flatMap((node) => node.gain.setTargetAtTime.mock.calls);
    expect(outputGains.some(([target]) => target === 0)).toBe(true);
    const before = context().created.length;
    board.thud();
    expect(context().created.length).toBe(before);
  });

  it('applies mute and duck requested before the context exists', () => {
    const board = new SoundBoard();
    board.setMuted(true);
    board.duck(true);
    board.unlock();
    const gains = context().created.map((node) => node.gain.value);
    expect(gains).toContain(0);
    expect(gains.some((value) => Math.abs(value - 0.05) < 1e-9)).toBe(true);
  });

  it('keeps ducking independent from muting', async () => {
    const board = unlocked();
    await Promise.resolve();
    board.duck(true);
    board.setMuted(true);
    board.setMuted(false);
    const perNode = context()
      .created.filter((node) => node.gain.setTargetAtTime.mock.calls.length > 0)
      .map((node) => node.gain.setTargetAtTime.mock.calls.map(([target]) => target));
    expect(perNode).toContainEqual([0.05]);
    expect(perNode).toContainEqual([0, 1]);
  });
});
