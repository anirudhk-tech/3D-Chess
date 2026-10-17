import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ambience, type BattleVoice } from './ambience';

function fakeVoice() {
  return {
    startBed: vi.fn(),
    distantClash: vi.fn(),
    shout: vi.fn(),
    drum: vi.fn(),
    horn: vi.fn(),
  } satisfies BattleVoice;
}

const totalEvents = (voice: ReturnType<typeof fakeVoice>) =>
  voice.distantClash.mock.calls.length +
  voice.shout.mock.calls.length +
  voice.drum.mock.calls.length +
  voice.horn.mock.calls.length;

describe('Ambience', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts the bed once and keeps firing battle events', () => {
    const voice = fakeVoice();
    const ambience = new Ambience(voice);
    ambience.start();
    ambience.start();
    expect(voice.startBed).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    expect(totalEvents(voice)).toBeGreaterThan(10);
    expect(voice.distantClash).toHaveBeenCalled();
    ambience.stop();
  });

  it('stops firing after stop()', () => {
    const voice = fakeVoice();
    const ambience = new Ambience(voice);
    ambience.start();
    vi.advanceTimersByTime(5_000);
    ambience.stop();
    const before = totalEvents(voice);
    vi.advanceTimersByTime(30_000);
    expect(totalEvents(voice)).toBe(before);
  });

  it('keeps pan within the stereo range for clashes', () => {
    const voice = fakeVoice();
    const ambience = new Ambience(voice);
    ambience.start();
    vi.advanceTimersByTime(60_000);
    for (const [pan] of voice.distantClash.mock.calls) {
      expect(pan).toBeGreaterThanOrEqual(-1);
      expect(pan).toBeLessThanOrEqual(1);
    }
    ambience.stop();
  });

  it('leaves no timers behind after stop(), including pending crowd shouts', () => {
    const voice = fakeVoice();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ambience = new Ambience(voice);
    ambience.start();
    vi.advanceTimersByTime(1_300);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    ambience.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.restoreAllMocks();
  });

  it('drops shouts scheduled before stop() when restarted', () => {
    const voice = fakeVoice();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ambience = new Ambience(voice);
    ambience.start();
    vi.advanceTimersByTime(1_300);
    const shoutsBefore = voice.shout.mock.calls.length;
    ambience.stop();
    ambience.start();
    expect(voice.startBed).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(voice.shout.mock.calls.length).toBe(shoutsBefore);
    ambience.stop();
    vi.restoreAllMocks();
  });

  it('fires crowd shouts for rolls in the crowd band', () => {
    const voice = fakeVoice();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ambience = new Ambience(voice);
    ambience.start();
    vi.advanceTimersByTime(5_000);
    ambience.stop();
    expect(voice.shout).toHaveBeenCalled();
    expect(voice.distantClash).not.toHaveBeenCalled();
    for (const [pan] of voice.shout.mock.calls) expect(Math.abs(pan)).toBeLessThanOrEqual(1);
    vi.restoreAllMocks();
  });
});
