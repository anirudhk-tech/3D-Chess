import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ARENA_LIMIT, FirstPersonController, PLAYER_RADIUS, resolveCollisions } from './firstPerson';

describe('resolveCollisions', () => {
  it('pushes the player out of an obstacle', () => {
    const result = resolveCollisions({ x: 0.1, z: 0 }, [{ x: 0, z: 0, radius: 0.35 }]);
    expect(Math.hypot(result.x, result.z)).toBeCloseTo(0.35 + PLAYER_RADIUS, 5);
    expect(result.x).toBeGreaterThan(0);
  });

  it('leaves the player alone when clear of obstacles', () => {
    expect(resolveCollisions({ x: 3, z: 3 }, [{ x: 0, z: 0, radius: 0.35 }])).toEqual({ x: 3, z: 3 });
  });

  it('handles standing exactly on an obstacle centre', () => {
    const result = resolveCollisions({ x: 1, z: 1 }, [{ x: 1, z: 1, radius: 0.35 }]);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Math.hypot(result.x - 1, result.z - 1)).toBeGreaterThanOrEqual(0.35 + PLAYER_RADIUS - 1e-9);
  });

  it('keeps the player inside the arena', () => {
    const result = resolveCollisions({ x: 50, z: -50 }, []);
    expect(result).toEqual({ x: ARENA_LIMIT, z: -ARENA_LIMIT });
  });
});

let events = new EventTarget();

function press(code: string, type: 'keydown' | 'keyup' = 'keydown') {
  events.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
}

function setup() {
  const camera = new PerspectiveCamera(70, 1, 0.05, 100);
  const onStep = vi.fn();
  events = new EventTarget();
  const controller = new FirstPersonController(camera, new EventTarget(), () => [], onStep, events);
  controller.activate();
  return { controller, camera, onStep };
}

function run(controller: FirstPersonController, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) controller.update(1 / 60);
}

describe('FirstPersonController', () => {
  it('walks forward toward the enemy side when up is held', () => {
    const { controller } = setup();
    const startZ = controller.z;
    press('ArrowUp');
    run(controller, 1);
    press('ArrowUp', 'keyup');
    expect(controller.z).toBeLessThan(startZ - 1);
    expect(Math.abs(controller.x)).toBeLessThan(0.01);
  });

  it('runs faster with shift held', () => {
    const walker = setup().controller;
    press('ArrowUp');
    run(walker, 1);
    press('ArrowUp', 'keyup');

    const runner = setup().controller;
    press('ShiftLeft');
    press('ArrowUp');
    run(runner, 1);
    press('ArrowUp', 'keyup');
    press('ShiftLeft', 'keyup');

    expect(runner.z).toBeLessThan(walker.z - 0.5);
  });

  it('turns with the left and right arrows', () => {
    const { controller } = setup();
    press('ArrowLeft');
    run(controller, 0.5);
    press('ArrowLeft', 'keyup');
    expect(controller.yaw).toBeGreaterThan(0.5);
  });

  it('bobs the camera and reports footsteps while walking', () => {
    const { controller, camera, onStep } = setup();
    press('ArrowUp');
    const heights = new Set<number>();
    for (let t = 0; t < 2; t += 1 / 60) {
      controller.update(1 / 60);
      heights.add(Math.round(camera.position.y * 10000));
    }
    press('ArrowUp', 'keyup');
    expect(heights.size).toBeGreaterThan(5);
    expect(onStep.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('stands still with no keys held', () => {
    const { controller, onStep } = setup();
    const { x, z } = controller;
    run(controller, 1);
    expect({ x: controller.x, z: controller.z }).toEqual({ x, z });
    expect(onStep).not.toHaveBeenCalled();
  });
});
