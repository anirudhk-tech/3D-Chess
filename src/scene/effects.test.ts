import { type Mesh, type MeshBasicMaterial, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { COLORS, ParticleSystem } from './effects';

const burst = (
  system: ParticleSystem,
  overrides: Partial<Parameters<ParticleSystem['emit']>[0]> = {},
) => {
  system.emit({
    position: new Vector3(),
    count: 5,
    color: COLORS.dust,
    speed: 1,
    up: 1,
    size: 0.1,
    life: 0.3,
    ...overrides,
  });
};

describe('ParticleSystem', () => {
  it('removes particles from the scene once their life runs out', () => {
    const scene = new Scene();
    const system = new ParticleSystem(scene);
    burst(system);
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
    burst(system, {
      position: new Vector3(0, 0.05, 0),
      count: 3,
      speed: 0.5,
      up: 0,
      life: 1,
      gravity: 20,
    });
    for (let i = 0; i < 20; i++) system.update(0.02);
    expect(scene.children.every((child) => child.position.y >= 0.02)).toBe(true);
  });

  it('shares one material across a burst and reuses it for the next one', () => {
    const system = new ParticleSystem(new Scene());
    burst(system, { count: 40 });
    expect(system.materialCount).toBe(1);
    system.update(1);
    burst(system, { count: 40 });
    expect(system.materialCount).toBe(1);
  });

  it('uses a separate material per colour', () => {
    const system = new ParticleSystem(new Scene());
    burst(system);
    burst(system, { color: COLORS.gold });
    expect(system.materialCount).toBe(2);
  });

  it('fades opacity with remaining life and restores it when recycled', () => {
    const scene = new Scene();
    const system = new ParticleSystem(scene);
    burst(system, { count: 1, life: 1 });
    system.update(0.5);
    const mesh = scene.children[0] as Mesh;
    const material = mesh.material as MeshBasicMaterial;
    expect(material.opacity).toBeCloseTo(0.5, 5);
    system.update(1);
    burst(system, { count: 1 });
    expect(material.opacity).toBe(1);
  });

  it('grows shockwave rings instead of shrinking them', () => {
    const scene = new Scene();
    const system = new ParticleSystem(scene);
    system.shockwave(new Vector3(1, 0, 2), COLORS.dust, 2);
    const [ring] = scene.children;
    if (!ring) throw new Error('expected a ring');
    const before = ring.scale.x;
    system.update(0.2);
    expect(ring.scale.x).toBeGreaterThan(before);
    expect(ring.position.x).toBe(1);
  });

  it('empties the scene and stops tracking particles on dispose', () => {
    const scene = new Scene();
    const system = new ParticleSystem(scene);
    burst(system);
    system.dispose();
    expect(system.count).toBe(0);
    expect(scene.children).toHaveLength(0);
    expect(system.materialCount).toBe(0);
  });
});
