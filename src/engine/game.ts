import { Chess, type Move, type PieceSymbol, type Color, type Square } from 'chess.js';

export type { PieceSymbol, Color, Square };

export interface Piece {
  /** Stable for the whole game, e.g. "white_knight_b1" (named after the starting square). */
  id: string;
  type: PieceSymbol;
  color: Color;
  square: Square;
}

/** What happened in one move, in the form the 3D layer needs to animate it. */
export interface MoveEvent {
  san: string;
  /** Piece that moved. `type` is its type before any promotion. */
  mover: Piece;
  from: Square;
  to: Square;
  /** Piece removed from the board, if any. For en passant its square differs from `to`. */
  captured?: Piece;
  /** Rook relocated by castling. */
  castleRook?: { piece: Piece; from: Square; to: Square };
  promotion?: PieceSymbol;
  check: boolean;
  checkmate: boolean;
}

export type GameStatus =
  | { over: false; turn: Color; check: boolean }
  | { over: true; result: 'checkmate'; winner: Color }
  | { over: true; result: 'draw'; reason: 'stalemate' | 'insufficient' | 'repetition' | 'fifty-move' };

const NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const pieceName = (type: PieceSymbol) => NAMES[type];

export class Game {
  private chess: Chess;
  private byId = new Map<string, Piece>();

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
    this.assignIds();
  }

  /** Give every piece on the board an ID from its current square. */
  private assignIds() {
    this.byId.clear();
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        const id = `${cell.color === 'w' ? 'white' : 'black'}_${NAMES[cell.type]}_${cell.square}`;
        this.byId.set(id, { id, type: cell.type, color: cell.color, square: cell.square });
      }
    }
  }

  get fen() {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn();
  }

  get history(): string[] {
    return this.chess.history();
  }

  pieces(): Piece[] {
    return [...this.byId.values()];
  }

  pieceAt(square: Square): Piece | undefined {
    return this.pieces().find((p) => p.square === square);
  }

  /** Legal moves for the side to move, optionally limited to one piece. */
  legalMoves(pieceId?: string): Move[] {
    if (!pieceId) return this.chess.moves({ verbose: true });
    const piece = this.byId.get(pieceId);
    if (!piece) return [];
    return this.chess.moves({ verbose: true, square: piece.square });
  }

  status(): GameStatus {
    if (this.chess.isCheckmate()) {
      return { over: true, result: 'checkmate', winner: this.chess.turn() === 'w' ? 'b' : 'w' };
    }
    if (this.chess.isStalemate()) return { over: true, result: 'draw', reason: 'stalemate' };
    if (this.chess.isInsufficientMaterial()) return { over: true, result: 'draw', reason: 'insufficient' };
    if (this.chess.isThreefoldRepetition()) return { over: true, result: 'draw', reason: 'repetition' };
    if (this.chess.isDraw()) return { over: true, result: 'draw', reason: 'fifty-move' };
    return { over: false, turn: this.chess.turn(), check: this.chess.inCheck() };
  }

  /**
   * Play a move given as SAN ("Nf3") or { from, to, promotion }.
   * Returns null if the move is illegal (the game is left unchanged).
   */
  move(input: string | { from: Square; to: Square; promotion?: PieceSymbol }): MoveEvent | null {
    let m: Move;
    try {
      m = this.chess.move(input);
    } catch {
      return null;
    }

    const mover = this.byId.get(this.idAt(m.from))!;
    let captured: Piece | undefined;
    let castleRook: MoveEvent['castleRook'];

    if (m.isEnPassant()) {
      // Captured pawn sits on the destination file, mover's starting rank.
      const sq = (m.to[0]! + m.from[1]!) as Square;
      captured = this.byId.get(this.idAt(sq));
    } else if (m.isCapture()) {
      captured = this.byId.get(this.idAt(m.to));
    }

    if (m.isKingsideCastle() || m.isQueensideCastle()) {
      const rank = m.from[1]!;
      const rookFrom = ((m.isKingsideCastle() ? 'h' : 'a') + rank) as Square;
      const rookTo = ((m.isKingsideCastle() ? 'f' : 'd') + rank) as Square;
      const rook = this.byId.get(this.idAt(rookFrom))!;
      castleRook = { piece: { ...rook }, from: rookFrom, to: rookTo };
      rook.square = rookTo;
    }

    const event: MoveEvent = {
      san: m.san,
      mover: { ...mover },
      from: m.from,
      to: m.to,
      captured: captured && { ...captured },
      castleRook,
      promotion: m.promotion,
      check: this.chess.inCheck(),
      checkmate: this.chess.isCheckmate(),
    };

    if (captured) this.byId.delete(captured.id);
    mover.square = m.to;
    if (m.promotion) mover.type = m.promotion;

    return event;
  }

  private idAt(square: Square): string {
    for (const p of this.byId.values()) if (p.square === square) return p.id;
    throw new Error(`No piece tracked at ${square}`);
  }
}
