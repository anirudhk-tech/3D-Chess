import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game';
import { interpret, parseIntent } from './interpret';
import { buildCandidates, buildMessages } from './prompt';

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

  it('includes the command and legal moves in the prompt', () => {
    const g = new Game();
    const messages = buildMessages('send the horse out', g, buildCandidates(g));
    expect(messages[1]?.content).toContain('Command: send the horse out');
    expect(messages[1]?.content).toContain('g1f3: white_knight_g1');
  });
});

describe('parseIntent', () => {
  const candidates = buildCandidates(new Game());

  it('accepts a valid move id', () => {
    const intent = parseIntent('{"action":"move","moveId":"g1f3","message":"On it"}', candidates);
    expect(intent).toEqual({ kind: 'move', from: 'g1', to: 'f3', promotion: undefined });
  });

  it('rejects an invented move id', () => {
    const intent = parseIntent('{"action":"move","moveId":"e2e5","message":""}', candidates);
    expect(intent.kind).toBe('none');
  });

  it('passes clarification questions through', () => {
    const intent = parseIntent('{"action":"clarify","moveId":null,"message":"Which knight?"}', candidates);
    expect(intent).toEqual({ kind: 'clarify', message: 'Which knight?' });
  });

  it('survives malformed JSON', () => {
    expect(parseIntent('not json', candidates).kind).toBe('none');
  });
});

describe('interpret', () => {
  it('sends the prompt through the completion function', async () => {
    const g = new Game();
    const intent = await interpret('advance the king pawn', g, async () =>
      '{"action":"move","moveId":"e2e4","message":"Forward"}',
    );
    expect(intent).toMatchObject({ kind: 'move', from: 'e2', to: 'e4' });
  });
});
