import type { Game } from '../engine/game';
import { buildCandidates, buildChoiceRequest } from './prompt';
import type { Candidate, Choose, Intent } from './types';

export interface InterpretOptions {
  minConfidence: number;
  random?: () => number;
}

function toIntent(candidate: Candidate, random: boolean): Intent {
  return {
    kind: 'move',
    from: candidate.from,
    to: candidate.to,
    promotion: candidate.promotion,
    random,
  };
}

function pickRandom(candidates: Candidate[], random: () => number): Candidate {
  const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1);
  const picked = candidates[index];
  if (picked === undefined) throw new Error('Cannot pick a move from an empty candidate list');
  return picked;
}

export async function interpret(
  transcript: string,
  game: Game,
  choose: Choose,
  { minConfidence, random = Math.random }: InterpretOptions,
): Promise<Intent> {
  const candidates = buildCandidates(game);
  if (candidates.length === 0) return { kind: 'none', message: 'The game is over' };

  const answer = await choose(buildChoiceRequest(transcript, game, candidates));
  const chosen = candidates.find((candidate) => candidate.id === answer.choice);
  if (chosen && answer.confidence >= minConfidence) return toIntent(chosen, false);
  return toIntent(pickRandom(candidates, random), true);
}
