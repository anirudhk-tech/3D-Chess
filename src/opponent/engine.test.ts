import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { findBestMove } from './engine';

const quick = { maxDepth: 3, timeMs: 5000 };

describe('findBestMove', () => {
  it('finds mate in one for white', () => {
    const move = findBestMove('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', quick)!;
    expect(move.san).toBe('Ra8#');
  });

  it('finds mate in one for black', () => {
    const move = findBestMove('r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', quick)!;
    expect(move.san).toBe('Ra1#');
  });

  it('captures a hanging queen', () => {
    const move = findBestMove('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', quick)!;
    expect(move.san).toBe('Rxd5');
  });

  it('does not hang its queen to a pawn', () => {
    const fen = '4k3/8/2p5/8/3Q4/8/8/4K3 w - - 0 1';
    const move = findBestMove(fen, quick)!;
    const chess = new Chess(fen);
    chess.move(move.san);
    const replies = chess.moves({ verbose: true });
    const capturesQueen = replies.some((m) => m.captured === 'q');
    expect(capturesQueen).toBe(false);
  });

  it('returns null when there are no legal moves', () => {
    expect(findBestMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', quick)).toBeNull();
  });

  it('respects the time budget', () => {
    let clock = 0;
    const now = () => (clock += 5);
    const result = findBestMove(new Chess().fen(), { maxDepth: 8, timeMs: 200 }, now)!;
    expect(result.depth).toBeLessThan(8);
    expect(new Chess().moves({ verbose: true }).some((m) => m.san === result.san)).toBe(true);
  });

  it('only promotes to queens', () => {
    const move = findBestMove('8/P6k/8/8/8/8/8/K7 w - - 0 1', quick)!;
    expect(move.promotion).toBe('q');
  });
});
