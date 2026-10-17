import { describe, expect, it } from 'vitest';
import { fileRankToPosition, SQUARE_SIZE, squareToPosition } from './coords';

describe('squareToPosition', () => {
  it('puts white on the positive z side and a1 at the left', () => {
    const a1 = squareToPosition('a1');
    expect(a1.x).toBeCloseTo(-3.5 * SQUARE_SIZE);
    expect(a1.z).toBeCloseTo(3.5 * SQUARE_SIZE);
    const h8 = squareToPosition('h8');
    expect(h8.x).toBeCloseTo(3.5 * SQUARE_SIZE);
    expect(h8.z).toBeCloseTo(-3.5 * SQUARE_SIZE);
  });

  it('centres the board between d4 and e5', () => {
    const d4 = squareToPosition('d4');
    const e5 = squareToPosition('e5');
    expect((d4.x + e5.x) / 2).toBeCloseTo(0);
    expect((d4.z + e5.z) / 2).toBeCloseTo(0);
  });

  it('applies the requested height', () => {
    expect(squareToPosition('e4', 0.7).y).toBe(0.7);
  });

  it('agrees with the numeric file and rank form', () => {
    expect(fileRankToPosition(4, 3)).toEqual(squareToPosition('e4'));
  });
});
