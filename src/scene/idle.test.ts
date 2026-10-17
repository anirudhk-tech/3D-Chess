import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseClip, IdleAnimator } from './idle';
import { createPieceRig, type PieceRig } from './models';

function snapshot(rig: PieceRig) {
  return [...rig.rest.keys()].map((node) => node.rotation.toArray().slice(0, 3));
}

function runUntilClipStarts(idle: IdleAnimator, rig: PieceRig) {
  for (let i = 0; i < 2000 && !idle.isPlaying(rig); i++) idle.update(0.1, [rig]);
}

afterEach(() => vi.restoreAllMocks());

describe('chooseClip', () => {
  it('only offers clips whose limbs the piece actually has', () => {
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k'] as const) {
      const rig = createPieceRig(type, 'w');
      for (let i = 0; i < 30; i++) {
        const clip = chooseClip(rig);
        expect(() => {
          clip.apply(0.5, 1);
        }).not.toThrow();
      }
    }
  });

  it('picks from the full list using the random roll', () => {
    const rig = createPieceRig('q', 'w');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(chooseClip(rig).duration).toBe(3);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(chooseClip(rig).duration).toBe(2.6);
  });
});

describe('IdleAnimator', () => {
  it('leaves busy rigs completely alone', () => {
    const rig = createPieceRig('k', 'w');
    rig.busy = true;
    const before = snapshot(rig);
    const scaleY = rig.facing.scale.y;
    new IdleAnimator().update(30, [rig]);
    expect(snapshot(rig)).toEqual(before);
    expect(rig.facing.scale.y).toBe(scaleY);
  });

  it('breathes while idle without starting a clip immediately', () => {
    const rig = createPieceRig('p', 'w');
    const idle = new IdleAnimator();
    idle.update(0.016, [rig]);
    expect(idle.isPlaying(rig)).toBe(false);
    expect(Math.abs(rig.facing.scale.y - 1)).toBeLessThanOrEqual(0.0121);
  });

  it('plays a clip that moves the limbs and then returns to rest', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const rig = createPieceRig('p', 'w');
    const rest = snapshot(rig);
    const idle = new IdleAnimator();
    runUntilClipStarts(idle, rig);
    expect(idle.isPlaying(rig)).toBe(true);

    let moved = false;
    for (let i = 0; i < 20 && idle.isPlaying(rig); i++) {
      idle.update(0.1, [rig]);
      if (JSON.stringify(snapshot(rig)) !== JSON.stringify(rest)) moved = true;
    }
    expect(moved).toBe(true);
    idle.update(10, [rig]);
    expect(idle.isPlaying(rig)).toBe(false);
    expect(snapshot(rig)).toEqual(rest);
    expect(rig.figure.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('snaps back to rest when released mid-clip', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const rig = createPieceRig('b', 'b');
    const rest = snapshot(rig);
    const idle = new IdleAnimator();
    runUntilClipStarts(idle, rig);
    idle.update(1.5, [rig]);
    idle.release(rig);
    expect(idle.isPlaying(rig)).toBe(false);
    expect(snapshot(rig)).toEqual(rest);
    expect(rig.facing.scale.y).toBe(1);
  });

  it('animates rooks with a sway that leaves the figure upright afterwards', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const rig = createPieceRig('r', 'w');
    const idle = new IdleAnimator();
    runUntilClipStarts(idle, rig);
    idle.update(1.5, [rig]);
    expect(rig.figure.rotation.z).not.toBe(0);
    idle.update(10, [rig]);
    expect(rig.figure.rotation.z).toBe(0);
  });
});
