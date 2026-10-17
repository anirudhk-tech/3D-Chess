import { Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { PieceSymbol } from '../engine/game';
import { createPieceRig, resetToRest, restAngle } from './models';

const TYPES: PieceSymbol[] = ['p', 'n', 'b', 'r', 'q', 'k'];

function meshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof Mesh) meshes.push(node as Mesh);
  });
  return meshes;
}

describe('createPieceRig', () => {
  it.each(TYPES)('builds a rig for %s whose type matches its capabilities', (type) => {
    const rig = createPieceRig(type, 'w');
    expect(rig.type).toBe(type);
    if (rig.type === 'r') {
      expect(rig.wheels).toHaveLength(4);
      expect(rig.rest.has(rig.ram)).toBe(true);
    } else if (rig.type === 'n') {
      expect(rig.legs).toHaveLength(4);
      expect(rig.rest.has(rig.horseHead)).toBe(true);
    } else {
      expect(rig.rest.has(rig.armR)).toBe(true);
      expect(rig.rest.has(rig.head)).toBe(true);
    }
  });

  it('gives pawns and kings two legs and bishops and queens none', () => {
    const legCount = (type: PieceSymbol) => {
      const rig = createPieceRig(type, 'b');
      if (rig.type === 'r' || rig.type === 'n') throw new Error('expected a humanoid rig');
      return rig.legs.length;
    };
    expect([legCount('p'), legCount('k'), legCount('b'), legCount('q')]).toEqual([2, 2, 0, 0]);
  });

  it('faces each colour toward the opponent', () => {
    expect(createPieceRig('p', 'w').facing.rotation.y).toBeCloseTo(Math.PI);
    expect(createPieceRig('p', 'b').facing.rotation.y).toBe(0);
  });

  it('shares geometries and materials between pieces instead of rebuilding them', () => {
    const first = meshesOf(createPieceRig('k', 'w').root);
    const second = meshesOf(createPieceRig('k', 'w').root);
    expect(first.length).toBe(second.length);
    first.forEach((mesh, index) => {
      expect(second[index]?.geometry).toBe(mesh.geometry);
      expect(second[index]?.material).toBe(mesh.material);
    });
  });
});

describe('resetToRest', () => {
  it('restores every tracked node and the figure transform', () => {
    const rig = createPieceRig('n', 'w');
    if (rig.type !== 'n') throw new Error('expected a knight rig');
    const leg = rig.legs[1];
    const rest = restAngle(rig, leg, 'x');
    leg.rotation.x = rest + 1;
    rig.figure.rotation.set(1, 1, 1);
    rig.figure.position.y = 2;
    rig.facing.scale.y = 1.5;
    resetToRest(rig);
    expect(leg.rotation.x).toBe(rest);
    expect(rig.figure.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(rig.figure.position.y).toBe(0);
    expect(rig.facing.scale.y).toBe(1);
  });

  it('puts the ram back where it started', () => {
    const rig = createPieceRig('r', 'b');
    if (rig.type !== 'r') throw new Error('expected a siege rig');
    const startZ = rig.ram.position.z;
    rig.ram.position.z += 0.3;
    resetToRest(rig);
    expect(rig.ram.position.z).toBe(startZ);
  });
});
