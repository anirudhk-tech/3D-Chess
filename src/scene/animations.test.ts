import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { die, sink, strike, turnTo, walk, yawToward } from './animations';
import { createPieceRig, restAngle, type PieceRig } from './models';
import { Tweens } from './tween';

async function settle(tweens: Tweens, seconds: number, step = 1 / 60) {
  for (let t = 0; t < seconds; t += step) {
    tweens.update(step);
    await Promise.resolve();
  }
}

async function finish<T>(tweens: Tweens, promise: Promise<T>, seconds = 5) {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await settle(tweens, seconds);
  await Promise.resolve();
  return done;
}

const poseSignature = (rig: PieceRig) =>
  JSON.stringify(
    [...rig.rest.keys()].map((node) => [
      node.rotation.toArray().slice(0, 3),
      node.position.toArray(),
    ]),
  );

describe('yawToward', () => {
  it('measures yaw from +z toward the target', () => {
    expect(yawToward(new Vector3(), new Vector3(0, 0, 1))).toBeCloseTo(0);
    expect(yawToward(new Vector3(), new Vector3(1, 0, 0))).toBeCloseTo(Math.PI / 2);
  });
});

describe('turnTo', () => {
  it('turns the short way round', async () => {
    const tweens = new Tweens();
    const rig = createPieceRig('p', 'b');
    rig.facing.rotation.y = 3;
    const turning = turnTo(tweens, rig, -3);
    expect(await finish(tweens, turning)).toBe(true);
    expect(Math.cos(rig.facing.rotation.y)).toBeCloseTo(Math.cos(-3), 5);
    expect(rig.facing.rotation.y).toBeGreaterThan(3);
  });

  it('resolves immediately when already facing the target', async () => {
    const rig = createPieceRig('p', 'b');
    await expect(turnTo(new Tweens(), rig, 0.001)).resolves.toBeUndefined();
  });
});

describe('walk', () => {
  it.each(['p', 'n', 'b', 'r', 'q', 'k'] as const)(
    'moves a %s to the target and restores its pose',
    async (type) => {
      const tweens = new Tweens();
      const rig = createPieceRig(type, 'w');
      const pose = poseSignature(rig);
      const target = new Vector3(2, 0, -1);
      expect(await finish(tweens, walk(tweens, rig, target, type === 'n' ? 0.4 : 0), 10)).toBe(
        true,
      );
      expect(rig.root.position.distanceTo(target)).toBeLessThan(1e-6);
      expect(rig.root.position.y).toBe(0);
      expect(poseSignature(rig)).toBe(pose);
      expect(rig.figure.position.y).toBe(0);
    },
  );

  it('resolves at once for a zero-length walk', async () => {
    const rig = createPieceRig('p', 'w');
    await expect(walk(new Tweens(), rig, rig.root.position.clone())).resolves.toBeUndefined();
  });

  it('moves rooks slower than other pieces over the same distance', () => {
    const pawn = createPieceRig('p', 'w');
    const rook = createPieceRig('r', 'w');
    const pawnTweens = new Tweens();
    const rookTweens = new Tweens();
    void walk(pawnTweens, pawn, new Vector3(0, 0, 2));
    void walk(rookTweens, rook, new Vector3(0, 0, 2));
    pawnTweens.update(0.5);
    rookTweens.update(0.5);
    expect(pawn.root.position.z).toBeGreaterThan(rook.root.position.z);
  });
});

describe('strike', () => {
  it.each(['p', 'n', 'b', 'r', 'q', 'k'] as const)(
    'hits exactly once and leaves a %s at rest',
    async (type) => {
      const tweens = new Tweens();
      const rig = createPieceRig(type, 'w');
      const pose = poseSignature(rig);
      const onHit = vi.fn();
      expect(await finish(tweens, strike(tweens, rig, onHit))).toBe(true);
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(poseSignature(rig)).toBe(pose);
      expect(rig.figure.rotation.x).toBe(0);
    },
  );

  it('raises the arm before the hit lands', () => {
    const tweens = new Tweens();
    const rig = createPieceRig('k', 'w');
    if (rig.type === 'r' || rig.type === 'n') throw new Error('expected a humanoid');
    void strike(tweens, rig, vi.fn());
    tweens.update(0.3);
    expect(rig.armR.rotation.x).toBeLessThan(restAngle(rig, rig.armR, 'x') - 0.5);
  });
});

describe('die and sink', () => {
  it('topples humanoids forward, knights and rooks sideways', async () => {
    const tweens = new Tweens();
    const pawn = createPieceRig('p', 'b');
    const knight = createPieceRig('n', 'b');
    const rook = createPieceRig('r', 'b');
    const all = Promise.all(
      [pawn, knight, rook].map((rig) => die(tweens, rig, new Vector3(0, 0, 0.3))),
    );
    expect(await finish(tweens, all)).toBe(true);
    expect(pawn.figure.rotation.x).toBeLessThan(-1.4);
    expect(knight.figure.rotation.z).toBeGreaterThan(1.4);
    expect(rook.figure.rotation.z).toBeGreaterThan(1.4);
    expect(pawn.root.position.z).toBeCloseTo(0.3);
  });

  it('sinks the rig below the board', async () => {
    const tweens = new Tweens();
    const rig = createPieceRig('q', 'b');
    expect(await finish(tweens, sink(tweens, rig))).toBe(true);
    expect(rig.root.position.y).toBeLessThan(-1);
  });
});
