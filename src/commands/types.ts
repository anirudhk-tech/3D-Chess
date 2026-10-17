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
  | { kind: 'move'; from: Square; to: Square; promotion?: PieceSymbol; random: boolean }
  | { kind: 'none'; message: string };

export interface ChoiceRequest {
  state: Record<string, unknown>;
  instructions: string;
  criteria: Record<string, string>;
}

export interface ChoiceAnswer {
  choice: string;
  confidence: number;
}

export type Choose = (request: ChoiceRequest) => Promise<ChoiceAnswer>;
