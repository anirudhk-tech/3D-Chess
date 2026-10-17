import { Chess, type Square } from 'chess.js';
import { castleRookSquares, type Game, type Piece } from '../engine/game';
import type { Candidate } from './types';

export interface MoveTactics {
  defends: string[];
  threatens: string[];
  adjacent: string[];
}

const fileIndex = (square: Square) => square.charCodeAt(0) - 'a'.charCodeAt(0);
const rankIndex = (square: Square) => Number(square[1]);

const isNeighbour = (a: Square, b: Square) =>
  Math.max(Math.abs(fileIndex(a) - fileIndex(b)), Math.abs(rankIndex(a) - rankIndex(b))) === 1;

export function analyzeMove(game: Game, candidate: Candidate): MoveTactics {
  const chess = new Chess(game.fen);
  const color = chess.turn();
  const move = chess.move({
    from: candidate.from,
    to: candidate.to,
    promotion: candidate.promotion,
  });
  const rookSquares = castleRookSquares(move);

  const squareAfterMove = (piece: Piece): Square =>
    piece.square === rookSquares?.from ? rookSquares.to : piece.square;

  const tactics: MoveTactics = { defends: [], threatens: [], adjacent: [] };
  for (const piece of game.pieces()) {
    if (piece.id === candidate.pieceId || piece.id === candidate.capturesId) continue;
    const square = squareAfterMove(piece);
    if (chess.attackers(square, color).includes(candidate.to)) {
      (piece.color === color ? tactics.defends : tactics.threatens).push(piece.id);
    }
    if (isNeighbour(square, candidate.to)) tactics.adjacent.push(piece.id);
  }
  return tactics;
}
