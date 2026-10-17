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

  it("detects fool's mate", () => {
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

  it('reports queenside castling for black with both rook squares', () => {
    const g = new Game('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1');
    const ev = g.move('O-O-O')!;
    expect(ev.castleRook).toMatchObject({ from: 'a8', to: 'd8' });
    expect(ev.castleRook?.piece.id).toBe('black_rook_a8');
    expect(g.pieceAt('d8')?.id).toBe('black_rook_a8');
    expect(g.pieceAt('c8')?.id).toBe('black_king_e8');
  });

  it('does not report a castle rook for ordinary king moves', () => {
    const g = new Game('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    g.move('Kf1');
    expect(g.lastMove?.castleRook).toBeUndefined();
  });

  it('removes the captured piece when promoting with a capture', () => {
    const g = new Game('1r5k/P7/8/8/8/8/8/K7 w - - 0 1');
    const ev = g.move({ from: 'a7', to: 'b8', promotion: 'n' })!;
    expect(ev.captured?.id).toBe('black_rook_b8');
    expect(ev.mover.type).toBe('p');
    expect(g.pieceAt('b8')).toMatchObject({ id: 'white_pawn_a7', type: 'n' });
    expect(g.pieces()).toHaveLength(3);
  });

  it('tracks en passant captured squares for black', () => {
    const g = new Game('4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1');
    g.move('e4');
    const ev = g.move('dxe3')!;
    expect(ev.captured).toMatchObject({ id: 'white_pawn_e2', square: 'e4' });
    expect(g.pieceAt('e4')).toBeUndefined();
  });

  it('loads positions from FEN with ids derived from the squares', () => {
    const g = new Game('4k3/8/8/8/8/8/8/R3K3 b - - 0 1');
    expect(g.turn).toBe('b');
    expect(
      g
        .pieces()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['black_king_e8', 'white_king_e1', 'white_rook_a1']);
  });

  it('rejects an invalid FEN', () => {
    expect(() => new Game('not a fen')).toThrow();
  });

  it('returns recent moves newest first and nothing for a non-positive count', () => {
    const g = new Game();
    for (const m of ['e4', 'e5', 'Nf3']) g.move(m);
    expect(g.recentMoves(2).map((e) => e.san)).toEqual(['Nf3', 'e5']);
    expect(g.recentMoves(10)).toHaveLength(3);
    expect(g.recentMoves(0)).toEqual([]);
    expect(g.lastMove?.san).toBe('Nf3');
  });

  it('has no last move before the first move', () => {
    expect(new Game().lastMove).toBeUndefined();
  });

  it('detects insufficient material and the fifty-move rule', () => {
    expect(new Game('8/8/4k3/8/8/4K3/8/8 w - - 0 1').status()).toEqual({
      over: true,
      result: 'draw',
      reason: 'insufficient',
    });
    expect(new Game('4k3/8/8/8/8/8/8/R3K3 w - - 100 80').status()).toEqual({
      over: true,
      result: 'draw',
      reason: 'fifty-move',
    });
  });

  it('detects threefold repetition', () => {
    const g = new Game();
    for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) g.move(m);
    expect(g.status()).toEqual({ over: true, result: 'draw', reason: 'repetition' });
  });

  it('reports check in the status and the move event', () => {
    const g = new Game();
    for (const m of ['e4', 'f6']) g.move(m);
    const ev = g.move('Qh5+')!;
    expect(ev.check).toBe(true);
    expect(ev.checkmate).toBe(false);
    expect(g.status()).toEqual({ over: false, turn: 'b', check: true });
  });

  it('fails loudly when asked for a piece on an empty square', () => {
    expect(() => new Game().requirePieceAt('e4')).toThrow('No piece tracked at e4');
  });
});
