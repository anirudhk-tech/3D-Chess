import { capturedSquare, pieceName, type Game, type MoveEvent } from '../engine/game';
import { analyzeMove } from './tactics';
import type { Candidate, ChoiceRequest } from './types';

export function buildCandidates(game: Game): Candidate[] {
  return game.legalMoves().map((move) => {
    const capturedFrom = capturedSquare(move);
    return {
      id: move.lan,
      pieceId: game.requirePieceAt(move.from).id,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      capturesId: capturedFrom && game.requirePieceAt(capturedFrom).id,
    };
  });
}

const INSTRUCTIONS = `Which move best carries out the spoken \`command\`?
The player gives orders to pieces as if they were soldiers in an army.
Pawn means soldier, footman or infantry. Knight means horse, horseman or cavalry. Rook means tower, castle or guard. Bishop means priest.
Players refer to a piece by role, nickname, place on the board or target, for example "you, go attack that horse".
Prefer captures when the command says attack, kill, take or destroy.
Each option names the piece in \`pieces\` that would move and what the move would do.
Back up, support or protect a piece means move so that piece is defended. That piece usually means \`last_move\`.`;

function describePieces(game: Game): string[] {
  return game
    .pieces()
    .map(
      (p) => `${p.id}: ${p.color === 'w' ? 'white' : 'black'} ${pieceName(p.type)} on ${p.square}`,
    );
}

const RECENT_PLIES = 4;

function describeCandidate(game: Game, c: Candidate, recent: MoveEvent[]): string {
  const tactics = analyzeMove(game, c);
  const parts = [`${c.pieceId} moves from ${c.from} to ${c.to}`];
  if (c.capturesId) parts.push(`capturing ${c.capturesId}`);
  if (c.promotion) parts.push(`promoting to ${c.promotion}`);
  recent.forEach((event, index) => {
    const label = index === 0 ? 'the piece that just moved' : 'which moved recently';
    const id = event.mover.id;
    if (tactics.defends.includes(id)) parts.push(`backing up ${id}, ${label}`);
    if (tactics.threatens.includes(id)) parts.push(`attacking ${id}, ${label}`);
  });
  if (tactics.defends.length) parts.push(`defending ${tactics.defends.join(', ')}`);
  if (tactics.threatens.length) parts.push(`threatening ${tactics.threatens.join(', ')}`);
  if (tactics.adjacent.length) parts.push(`ending next to ${tactics.adjacent.join(', ')}`);
  return parts.join('; ');
}

function describeMove(event: MoveEvent): string {
  const capture = event.captured ? `, capturing ${event.captured.id}` : '';
  return `${event.mover.id} moved from ${event.from} to ${event.to}${capture}`;
}

export function buildChoiceRequest(
  transcript: string,
  game: Game,
  candidates: Candidate[],
): ChoiceRequest {
  const recent = game.recentMoves(RECENT_PLIES);
  return {
    state: {
      command: transcript,
      side_to_move: game.turn === 'w' ? 'white' : 'black',
      last_move: game.lastMove ? describeMove(game.lastMove) : 'none',
      recent_moves: recent.map(describeMove),
      board_fen: game.fen,
      pieces: describePieces(game),
    },
    instructions: INSTRUCTIONS,
    criteria: Object.fromEntries(candidates.map((c) => [c.id, describeCandidate(game, c, recent)])),
  };
}
