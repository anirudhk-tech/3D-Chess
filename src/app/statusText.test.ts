import { describe, expect, it } from 'vitest';
import { describeGameStatus } from './statusText';

describe('describeGameStatus', () => {
  it('names the side to move and flags check', () => {
    expect(describeGameStatus({ over: false, turn: 'w', check: false })).toBe('White to move');
    expect(describeGameStatus({ over: false, turn: 'b', check: true })).toBe(
      'Black to move (check)',
    );
  });

  it('names the winner on checkmate', () => {
    expect(describeGameStatus({ over: true, result: 'checkmate', winner: 'b' })).toBe(
      'Checkmate. Black wins',
    );
  });

  it('spells out the draw reason', () => {
    expect(describeGameStatus({ over: true, result: 'draw', reason: 'insufficient' })).toBe(
      'Draw (insufficient material)',
    );
    expect(describeGameStatus({ over: true, result: 'draw', reason: 'fifty-move' })).toBe(
      'Draw (fifty-move rule)',
    );
  });
});
