import { Chess } from 'chess.js';
import type { Game } from '../engine/game';
import type { Candidate } from './types';

export interface MoveTactics {
  defends: string[];
  threatens: string[];
  adjacent: string[];
}

const fileOf = (square: string) => square.charCodeAt(0) - 97;
const rankOf = (square: string) => Number(square[1]);

export function analyzeMove(game: Game, candidate: Candidate): MoveTactics {
  const chess = new Chess(game.fen);
  const color = chess.turn();
  chess.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion });

  const tactics: MoveTactics = { defends: [], threatens: [], adjacent: [] };
  for (const piece of game.pieces()) {
    if (piece.id === candidate.pieceId || piece.id === candidate.capturesId) continue;
    const attackedByMover = chess.attackers(piece.square, color).includes(candidate.to);
    if (attackedByMover) (piece.color === color ? tactics.defends : tactics.threatens).push(piece.id);
    const near =
      Math.max(
        Math.abs(fileOf(piece.square) - fileOf(candidate.to)),
        Math.abs(rankOf(piece.square) - rankOf(candidate.to)),
      ) === 1;
    if (near) tactics.adjacent.push(piece.id);
  }
  return tactics;
}
