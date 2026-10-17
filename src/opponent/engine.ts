import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';

export interface SearchOptions {
  maxDepth: number;
  timeMs: number;
}

export interface SearchResult {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  san: string;
  score: number;
  depth: number;
}

const MATE = 100_000;
const QUIESCENCE_DEPTH = 4;
const TIME_CHECK_INTERVAL = 256;

const VALUES: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const TABLES: Record<PieceSymbol, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0,
    20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5,
    -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30,
    -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10,
    -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0,
    -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5,
    5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40,
    -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0,
    0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

class OutOfTime extends Error {}

function evaluate(chess: Chess): number {
  let score = 0;
  const board = chess.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = board[row]![col];
      if (!cell) continue;
      if (cell.color === 'w') score += VALUES[cell.type] + TABLES[cell.type][row * 8 + col]!;
      else score -= VALUES[cell.type] + TABLES[cell.type][(7 - row) * 8 + col]!;
    }
  }
  return chess.turn() === 'w' ? score : -score;
}

function orderScore(move: Move): number {
  let score = 0;
  if (move.captured) score += 10 * VALUES[move.captured] - VALUES[move.piece] / 10;
  if (move.promotion) score += VALUES[move.promotion];
  return score;
}

function orderedMoves(chess: Chess, capturesOnly = false): Move[] {
  const moves = chess.moves({ verbose: true }).filter((m) => !m.promotion || m.promotion === 'q');
  const pool = capturesOnly ? moves.filter((m) => m.captured || m.promotion) : moves;
  return pool.sort((a, b) => orderScore(b) - orderScore(a));
}

class Search {
  private nodes = 0;
  private deadline: number;

  constructor(
    private chess: Chess,
    timeMs: number,
    private now: () => number,
  ) {
    this.deadline = now() + timeMs;
  }

  private tick() {
    if (++this.nodes % TIME_CHECK_INTERVAL === 0 && this.now() > this.deadline) throw new OutOfTime();
  }

  private quiesce(alpha: number, beta: number, depth: number): number {
    this.tick();
    const standPat = evaluate(this.chess);
    if (depth === 0 || standPat >= beta) return standPat;
    let best = standPat;
    alpha = Math.max(alpha, standPat);
    for (const move of orderedMoves(this.chess, true)) {
      this.chess.move(move.san);
      const score = -this.quiesce(-beta, -alpha, depth - 1);
      this.chess.undo();
      if (score > best) best = score;
      if (best >= beta) break;
      alpha = Math.max(alpha, best);
    }
    return best;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    if (this.chess.isCheckmate()) return -MATE + ply;
    if (this.chess.isDraw()) return 0;
    if (depth === 0) return this.quiesce(alpha, beta, QUIESCENCE_DEPTH);
    let best = -Infinity;
    for (const move of orderedMoves(this.chess)) {
      this.chess.move(move.san);
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      this.chess.undo();
      if (score > best) best = score;
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }

  searchRoot(depth: number, previousBest?: Move): { move: Move; score: number } {
    let moves = orderedMoves(this.chess);
    if (previousBest) {
      moves = [...moves.filter((m) => m.san === previousBest.san), ...moves.filter((m) => m.san !== previousBest.san)];
    }
    let alpha = -Infinity;
    let best = moves[0]!;
    for (const move of moves) {
      this.chess.move(move.san);
      const score = -this.negamax(depth - 1, -Infinity, -alpha, 1);
      this.chess.undo();
      if (score > alpha) {
        alpha = score;
        best = move;
      }
    }
    return { move: best, score: alpha };
  }
}

export function findBestMove(fen: string, options: SearchOptions, now: () => number = Date.now): SearchResult | null {
  const chess = new Chess(fen);
  const legal = orderedMoves(chess);
  if (legal.length === 0) return null;

  const search = new Search(chess, options.timeMs, now);
  let result: SearchResult = toResult(legal[0]!, 0, 0);
  let previous: Move | undefined;

  for (let depth = 1; depth <= options.maxDepth; depth++) {
    try {
      const { move, score } = search.searchRoot(depth, previous);
      previous = move;
      result = toResult(move, score, depth);
      if (Math.abs(score) > MATE - 100) break;
    } catch (error) {
      if (!(error instanceof OutOfTime)) throw error;
      break;
    }
  }
  return result;
}

function toResult(move: Move, score: number, depth: number): SearchResult {
  return { from: move.from, to: move.to, promotion: move.promotion, san: move.san, score, depth };
}
