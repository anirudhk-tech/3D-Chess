import { describe, expect, it } from 'vitest';
import { Game } from './game';

describe('Game', () => {
  it('starts with 32 uniquely named pieces', () => {
    const g = new Game();
    const ids = new Set(g.pieces().map((p) => p.id));
    expect(ids.size).toBe(32);
    expect(ids.has('white_knight_b1')).toBe(true);
    expect(g.legalMoves()).toHaveLength(20);
  });

  it('rejects illegal moves without changing state', () => {
    const g = new Game();
    const fen = g.fen;
    expect(g.move('Ke2')).toBeNull();
    expect(g.move({ from: 'e2', to: 'e5' })).toBeNull();
    expect(g.fen).toBe(fen);
  });

  it('keeps piece IDs stable as pieces move', () => {
    const g = new Game();
    g.move('Nf3');
    expect(g.pieces().find((p) => p.id === 'white_knight_g1')?.square).toBe('f3');
  });

  it('reports captures', () => {
    const g = new Game();
    for (const m of ['e4', 'd5']) g.move(m);
    const ev = g.move('exd5')!;
    expect(ev.captured?.id).toBe('black_pawn_d7');
    expect(g.pieces()).toHaveLength(31);
  });

  it('handles en passant capture on the correct square', () => {
    const g = new Game();
    for (const m of ['e4', 'a6', 'e5', 'd5']) g.move(m);
    const ev = g.move('exd6')!;
    expect(ev.to).toBe('d6');
    expect(ev.captured?.id).toBe('black_pawn_d7');
    expect(ev.captured?.square).toBe('d5');
    expect(g.pieceAt('d5')).toBeUndefined();
  });

  it('moves the rook when castling', () => {
    const g = new Game();
    for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) g.move(m);
    const ev = g.move('O-O')!;
    expect(ev.castleRook).toMatchObject({ from: 'h1', to: 'f1' });
    expect(g.pieces().find((p) => p.id === 'white_rook_h1')?.square).toBe('f1');
  });

  it('promotes and keeps the piece ID', () => {
    const g = new Game('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const ev = g.move({ from: 'a7', to: 'a8', promotion: 'q' })!;
    expect(ev.promotion).toBe('q');
    expect(g.pieceAt('a8')?.type).toBe('q');
  });

  it('detects fool\'s mate', () => {
    const g = new Game();
    for (const m of ['f3', 'e5', 'g4']) g.move(m);
    const ev = g.move('Qh4#')!;
    expect(ev.checkmate).toBe(true);
    expect(g.status()).toEqual({ over: true, result: 'checkmate', winner: 'b' });
  });

  it('detects stalemate', () => {
    const g = new Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(g.status()).toEqual({ over: true, result: 'draw', reason: 'stalemate' });
  });
});
