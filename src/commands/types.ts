import type { PieceSymbol, Square } from '../engine/game';

export interface Candidate {
  id: string;
  pieceId: string;
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  capturesId?: string;
}

export type Intent =
  | { kind: 'move'; from: Square; to: Square; promotion?: PieceSymbol }
  | { kind: 'clarify'; message: string }
  | { kind: 'none'; message: string };

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export type Complete = (messages: ChatMessage[]) => Promise<string>;
