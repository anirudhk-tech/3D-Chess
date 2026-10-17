import { describe, expect, it } from 'vitest';
import { IMMORTAL_GAME, loadPosition } from './famousGames';

describe('IMMORTAL_GAME', () => {
  const game = loadPosition(IMMORTAL_GAME);

  it('replays legally and leaves white to move', () => {
    expect(game.turn).toBe('w');
    expect(game.status().over).toBe(false);
  });

  it('matches the known position', () => {
    expect(game.pieceAt('b2')).toMatchObject({ color: 'b', type: 'q' });
    expect(game.pieceAt('d5')).toMatchObject({ color: 'w', type: 'n' });
    expect(game.pieceAt('f4')).toMatchObject({ color: 'w', type: 'b' });
    expect(game.pieceAt('c5')).toMatchObject({ color: 'b', type: 'b' });
    expect(game.pieceAt('f3')).toMatchObject({ color: 'w', type: 'q' });
  });

  it('has most of the army still on the board', () => {
    const count = (color: 'w' | 'b', type: string) => game.pieces().filter((p) => p.color === color && p.type === type).length;
    expect(count('w', 'q')).toBe(1);
    expect(count('b', 'q')).toBe(1);
    expect(count('w', 'r')).toBe(2);
    expect(count('b', 'r')).toBe(2);
    expect(game.pieces().length).toBeGreaterThanOrEqual(26);
  });

  it('offers the famous Bd6 sacrifice', () => {
    expect(game.legalMoves().some((m) => m.san === 'Bd6')).toBe(true);
  });
});
