import { describe, expect, it, vi } from 'vitest';
import { easeInOut, lerp, Tweens } from './tween';

describe('easeInOut', () => {
  it('is anchored at both ends and symmetric about the midpoint', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 10);
  });
});

describe('lerp', () => {
  it('interpolates linearly', () => {
    expect(lerp(2, 6, 0.25)).toBe(3);
  });
});

describe('Tweens', () => {
  it('reports progress and resolves exactly when the duration elapses', async () => {
    const tweens = new Tweens();
    const progress: number[] = [];
    const done = vi.fn();
    void tweens.run(1, (t) => progress.push(t)).then(done);

    tweens.update(0.25);
    tweens.update(0.25);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    expect(progress).toEqual([0.25, 0.5]);

    tweens.update(0.5);
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
    expect(progress[2]).toBe(1);
    expect(tweens.count).toBe(0);
  });

  it('clamps overshooting frames to a final progress of one', () => {
    const tweens = new Tweens();
    const onUpdate = vi.fn();
    void tweens.run(0.1, onUpdate);
    tweens.update(5);
    expect(onUpdate).toHaveBeenCalledWith(1);
  });

  it('resolves a zero-length tween instead of stalling on NaN progress', async () => {
    const tweens = new Tweens();
    const done = vi.fn();
    void tweens.wait(0).then(done);
    tweens.update(0.016);
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
    expect(tweens.count).toBe(0);
  });

  it('runs concurrent tweens independently', () => {
    const tweens = new Tweens();
    const short = vi.fn();
    const long = vi.fn();
    void tweens.run(0.2, short);
    void tweens.run(1, long);
    tweens.update(0.5);
    tweens.update(0.1);
    expect(short).toHaveBeenCalledTimes(1);
    expect(long).toHaveBeenCalledTimes(2);
    expect(tweens.count).toBe(1);
  });

  it('resolves every pending promise on cancelAll without running them again', async () => {
    const tweens = new Tweens();
    const onUpdate = vi.fn();
    const done = vi.fn();
    void tweens.run(10, onUpdate).then(done);
    tweens.cancelAll();
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
    tweens.update(1);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(tweens.count).toBe(0);
  });

  it('lets a tween started from a resolution run on the next update', async () => {
    const tweens = new Tweens();
    const order: string[] = [];
    void tweens.wait(0.1).then(() => {
      order.push('first');
      return tweens.wait(0.1).then(() => order.push('second'));
    });
    tweens.update(0.2);
    await Promise.resolve();
    await Promise.resolve();
    tweens.update(0.2);
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['first', 'second']);
  });
});
