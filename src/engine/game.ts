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
  private events: MoveEvent[] = [];

  constructor(fen?: string) {
    this.chess = fen ? new Chess(fen) : new Chess();
    this.assignIds();
  }

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

  get lastMove(): MoveEvent | undefined {
    return this.events[this.events.length - 1];
  }

  recentMoves(count: number): MoveEvent[] {
    return this.events.slice(-count).reverse();
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

    this.events.push(event);
    return event;
  }

  private idAt(square: Square): string {
    for (const p of this.byId.values()) if (p.square === square) return p.id;
    throw new Error(`No piece tracked at ${square}`);
  }
}
