import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraShake } from './shake';

describe('CameraShake', () => {
  it('produces no offset until triggered', () => {
    const shake = new CameraShake();
    expect(shake.advance(0.016, new Vector3(1, 1, 1)).length()).toBe(0);
  });

  it('decays linearly to zero over its duration', () => {
    const shake = new CameraShake();
    shake.trigger(1, 1);
    shake.advance(0.5, new Vector3());
    expect(shake.strength).toBeCloseTo(0.5, 5);
    shake.advance(0.5, new Vector3());
    expect(shake.strength).toBe(0);
    expect(shake.advance(0.1, new Vector3(3, 3, 3)).length()).toBe(0);
  });

  it('keeps offsets within half the current strength per axis', () => {
    const shake = new CameraShake();
    shake.trigger(0.2, 1);
    const offset = new Vector3();
    for (let i = 0; i < 50; i++) {
      shake.advance(0.01, offset);
      const limit = shake.strength / 2 + 1e-9;
      expect(
        Math.max(Math.abs(offset.x), Math.abs(offset.y), Math.abs(offset.z)),
      ).toBeLessThanOrEqual(limit);
    }
  });

  it('ignores a weaker shake while a stronger one is still playing', () => {
    const shake = new CameraShake();
    shake.trigger(1, 1);
    shake.trigger(0.1, 5);
    expect(shake.strength).toBe(1);
    shake.advance(1, new Vector3());
    shake.trigger(0.1, 5);
    expect(shake.strength).toBeCloseTo(0.1, 5);
  });
});
