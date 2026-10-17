import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game';
import { interpret } from './interpret';
import { buildCandidates, buildChoiceRequest } from './prompt';

describe('candidates', () => {
  it('lists all 20 opening moves with piece ids', () => {
    const candidates = buildCandidates(new Game());
    expect(candidates).toHaveLength(20);
    expect(candidates.find((c) => c.id === 'g1f3')?.pieceId).toBe('white_knight_g1');
  });

  it('marks captures with the captured piece id', () => {
    const g = new Game();
    for (const m of ['e4', 'd5']) g.move(m);
    const capture = buildCandidates(g).find((c) => c.id === 'e4d5');
    expect(capture?.capturesId).toBe('black_pawn_d7');
  });
});

describe('choice request', () => {
  it('carries the command and one criterion per legal move', () => {
    const g = new Game();
    const request = buildChoiceRequest('send the horse out', g, buildCandidates(g));
    expect(request.state.command).toBe('send the horse out');
    expect(Object.keys(request.criteria)).toHaveLength(20);
    expect(request.criteria.g1f3).toContain('white_knight_g1');
  });
});

describe('interpret', () => {
  const options = { minConfidence: 0.5 };

  it('plays the chosen move when confident', async () => {
    const intent = await interpret('advance the king pawn', new Game(), async () => ({ choice: 'e2e4', confidence: 0.9 }), options);
    expect(intent).toEqual({ kind: 'move', from: 'e2', to: 'e4', promotion: undefined, random: false });
  });

  it('moves at random when confidence is too low', async () => {
    const intent = await interpret('mumble', new Game(), async () => ({ choice: 'e2e4', confidence: 0.1 }), {
      ...options,
      random: () => 0,
    });
    expect(intent).toMatchObject({ kind: 'move', random: true });
    expect(buildCandidates(new Game())[0]).toMatchObject({ from: (intent as { from: string }).from });
  });

  it('moves at random when the answer is not a legal move', async () => {
    const intent = await interpret('x', new Game(), async () => ({ choice: 'e2e5', confidence: 0.99 }), options);
    expect(intent).toMatchObject({ kind: 'move', random: true });
  });

  it('reports a finished game', async () => {
    const g = new Game();
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) g.move(m);
    const intent = await interpret('anything', g, async () => ({ choice: '', confidence: 1 }), options);
    expect(intent.kind).toBe('none');
  });
});

describe('tactics in criteria', () => {
  it('describes the last move with piece ids', () => {
    const g = new Game();
    for (const m of ['e4', 'd5', 'exd5']) g.move(m);
    const request = buildChoiceRequest('support', g, buildCandidates(g));
    expect(request.state.last_move).toBe('white_pawn_e2 moved from e4 to d5, capturing black_pawn_d7');
  });

  it('marks a move that backs up the piece that just moved', () => {
    const g = new Game();
    for (const m of ['Nf3', 'a6', 'e3', 'a5']) g.move(m);
    const request = buildChoiceRequest('back up that horse', g, buildCandidates(g));
    expect(request.criteria.f1e2).toContain('backing up white_knight_g1, which moved recently');
  });

  it('marks threats and neighbours', () => {
    const g = new Game();
    for (const m of ['e4', 'e5', 'Nf3', 'Nc6']) g.move(m);
    const request = buildChoiceRequest('attack', g, buildCandidates(g));
    expect(request.criteria.d2d4).toContain('threatening black_pawn_e7');
    expect(request.criteria.d2d4).toContain('ending next to');
  });
});
