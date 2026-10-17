import { pieceName, type Game } from '../engine/game';
import type { Candidate, ChatMessage } from './types';

export function buildCandidates(game: Game): Candidate[] {
  return game.legalMoves().map((move) => {
    const mover = game.pieceAt(move.from)!;
    const target = move.isEnPassant() ? game.pieceAt((move.to[0]! + move.from[1]!) as typeof move.to) : game.pieceAt(move.to);
    return {
      id: move.lan,
      pieceId: mover.id,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      capturesId: move.isCapture() ? target?.id : undefined,
    };
  });
}

const SYSTEM_PROMPT = `You translate spoken commands in a chess game into exactly one legal move.
The player commands pieces like soldiers in an army. Players refer to pieces by role, nickname, place or target:
pawn = soldier, footman, infantry; knight = horse, horseman, cavalry; rook = tower, castle, guard; bishop = priest; queen; king.
They may say things like "you, go attack that horse" or "send the left soldier forward".
Reply with JSON only. Rules:
- action "move": pick exactly one candidate id from the provided list and put it in moveId. Never invent an id.
- action "clarify": the command could mean several candidates and you cannot choose. Ask one short question in message.
- action "none": the command is not a move, or no candidate matches it. Explain briefly in message.
- For "move", message is a short in-character acknowledgement. For clarify and none, moveId is null.
- Prefer captures when the player says attack, kill, take or destroy.`;

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['move', 'clarify', 'none'] },
    moveId: { type: ['string', 'null'] },
    message: { type: 'string' },
  },
  required: ['action', 'moveId', 'message'],
  additionalProperties: false,
} as const;

function describePieces(game: Game): string {
  return game
    .pieces()
    .map((p) => `${p.id}: ${p.color === 'w' ? 'white' : 'black'} ${pieceName(p.type)} on ${p.square}`)
    .join('\n');
}

function describeCandidates(candidates: Candidate[]): string {
  return candidates
    .map((c) => {
      const capture = c.capturesId ? ` captures ${c.capturesId}` : '';
      const promotion = c.promotion ? ` promotes to ${c.promotion}` : '';
      return `${c.id}: ${c.pieceId} ${c.from}->${c.to}${capture}${promotion}`;
    })
    .join('\n');
}

export function buildMessages(transcript: string, game: Game, candidates: Candidate[]): ChatMessage[] {
  const recent = game.history.slice(-6).join(' ') || 'none';
  const user = `Side to move: ${game.turn === 'w' ? 'white' : 'black'}
Recent moves: ${recent}

Pieces:
${describePieces(game)}

Candidate moves:
${describeCandidates(candidates)}

Command: ${transcript}`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}
