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
});
