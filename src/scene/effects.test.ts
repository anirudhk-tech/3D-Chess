import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { COLORS, ParticleSystem } from './effects';

describe('ParticleSystem', () => {
  it('removes particles from the scene once their life runs out', () => {
    const scene = new Scene();
    const system = new ParticleSystem(scene);
    system.emit({ position: new Vector3(), count: 5, color: COLORS.dust, speed: 1, up: 1, size: 0.1, life: 0.3 });
    system.shockwave(new Vector3(), COLORS.dust, 2);
    expect(system.count).toBe(6);
    expect(scene.children).toHaveLength(6);

    system.update(0.2);
    expect(system.count).toBe(6);
    system.update(0.2);
    expect(system.count).toBe(1);
    system.update(0.5);
    expect(system.count).toBe(0);
    expect(scene.children).toHaveLength(0);
  });

  it('keeps particles from sinking below the floor', () => {
    const scene = new Scene();
    const system = new ParticleSystem(scene);
    system.emit({ position: new Vector3(0, 0.05, 0), count: 3, color: COLORS.dust, speed: 0.5, up: 0, size: 0.1, life: 1, gravity: 20 });
    for (let i = 0; i < 20; i++) system.update(0.02);
    expect(scene.children.every((child) => child.position.y >= 0.02)).toBe(true);
  });
});
