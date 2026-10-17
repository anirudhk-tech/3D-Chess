import { Chess, type Move, type PieceSymbol, type Color, type Square } from 'chess.js';

export type { PieceSymbol, Color, Square };

export interface Piece {
  id: string;
  type: PieceSymbol;
  color: Color;
  square: Square;
}

export interface MoveEvent {
  san: string;
  mover: Piece;
  from: Square;
  to: Square;
  captured?: Piece;
  castleRook?: { piece: Piece; from: Square; to: Square };
  promotion?: PieceSymbol;
  check: boolean;
  checkmate: boolean;
}

export type GameStatus =
  | { over: false; turn: Color; check: boolean }
  | { over: true; result: 'checkmate'; winner: Color }
  | {
      over: true;
      result: 'draw';
      reason: 'stalemate' | 'insufficient' | 'repetition' | 'fifty-move';
    };

const NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const pieceName = (type: PieceSymbol) => NAMES[type];

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export function capturedSquare(move: Move): Square | undefined {
  if (move.isEnPassant()) return `${move.to[0]}${move.from[1]}` as Square;
  return move.isCapture() ? move.to : undefined;
}

export function castleRookSquares(move: Move): { from: Square; to: Square } | undefined {
  const rank = move.from[1];
  if (move.isKingsideCastle()) return { from: `h${rank}` as Square, to: `f${rank}` as Square };
  if (move.isQueensideCastle()) return { from: `a${rank}` as Square, to: `d${rank}` as Square };
  return undefined;
}

export class Game {
  private chess: Chess;
  private piecesById = new Map<string, Piece>();
  private events: MoveEvent[] = [];

  constructor(fen?: string) {
    this.chess = fen === undefined ? new Chess() : new Chess(fen);
    this.assignIds();
  }

  private assignIds() {
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        const id = `${cell.color === 'w' ? 'white' : 'black'}_${NAMES[cell.type]}_${cell.square}`;
        this.piecesById.set(id, { id, type: cell.type, color: cell.color, square: cell.square });
      }
    }
  }

  get fen() {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn();
  }

  get lastMove(): MoveEvent | undefined {
    return this.events.at(-1);
  }

  recentMoves(count: number): MoveEvent[] {
    return count > 0 ? this.events.slice(-count).reverse() : [];
  }

  pieces(): Piece[] {
    return [...this.piecesById.values()];
  }

  pieceAt(square: Square): Piece | undefined {
    return this.pieces().find((piece) => piece.square === square);
  }

  legalMoves(): Move[] {
    return this.chess.moves({ verbose: true });
  }

  status(): GameStatus {
    if (this.chess.isCheckmate()) {
      return { over: true, result: 'checkmate', winner: this.chess.turn() === 'w' ? 'b' : 'w' };
    }
    if (this.chess.isStalemate()) return { over: true, result: 'draw', reason: 'stalemate' };
    if (this.chess.isInsufficientMaterial())
      return { over: true, result: 'draw', reason: 'insufficient' };
    if (this.chess.isThreefoldRepetition())
      return { over: true, result: 'draw', reason: 'repetition' };
    if (this.chess.isDraw()) return { over: true, result: 'draw', reason: 'fifty-move' };
    return { over: false, turn: this.chess.turn(), check: this.chess.inCheck() };
  }

  move(input: string | MoveInput): MoveEvent | null {
    let move: Move;
    try {
      move = this.chess.move(input);
    } catch {
      return null;
    }

    const mover = this.requirePieceAt(move.from);
    const capturedFrom = capturedSquare(move);
    const captured = capturedFrom && this.requirePieceAt(capturedFrom);
    const rookSquares = castleRookSquares(move);
    const rook = rookSquares && this.requirePieceAt(rookSquares.from);

    const event: MoveEvent = {
      san: move.san,
      mover: { ...mover },
      from: move.from,
      to: move.to,
      captured: captured && { ...captured },
      castleRook: rook && rookSquares && { piece: { ...rook }, ...rookSquares },
      promotion: move.promotion,
      check: this.chess.inCheck(),
      checkmate: this.chess.isCheckmate(),
    };

    if (captured) this.piecesById.delete(captured.id);
    if (rook && rookSquares) rook.square = rookSquares.to;
    mover.square = move.to;
    if (move.promotion) mover.type = move.promotion;

    this.events.push(event);
    return event;
  }

  requirePieceAt(square: Square): Piece {
    const piece = this.pieceAt(square);
    if (!piece) throw new Error(`No piece tracked at ${square}`);
    return piece;
  }
}
