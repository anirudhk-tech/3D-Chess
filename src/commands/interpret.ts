import type { Game } from '../engine/game';
import { buildCandidates, buildMessages } from './prompt';
import type { Candidate, Complete, Intent } from './types';

export function parseIntent(raw: string, candidates: Candidate[]): Intent {
  let parsed: { action?: string; moveId?: string | null; message?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'none', message: 'Could not understand the reply' };
  }
  const message = typeof parsed.message === 'string' ? parsed.message : '';
  if (parsed.action === 'clarify') return { kind: 'clarify', message };
  if (parsed.action === 'move') {
    const chosen = candidates.find((c) => c.id === parsed.moveId);
    if (!chosen) return { kind: 'none', message: 'That order did not match any legal move' };
    return { kind: 'move', from: chosen.from, to: chosen.to, promotion: chosen.promotion };
  }
  return { kind: 'none', message };
}

export async function interpret(transcript: string, game: Game, complete: Complete): Promise<Intent> {
  const candidates = buildCandidates(game);
  if (candidates.length === 0) return { kind: 'none', message: 'The game is over' };
  const raw = await complete(buildMessages(transcript, game, candidates));
  return parseIntent(raw, candidates);
}
