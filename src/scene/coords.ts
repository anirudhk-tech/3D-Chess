import { Vector3 } from 'three';
import type { Square } from '../engine/game';

export const SQUARE_SIZE = 1;
export const BOARD_SQUARES = 8;

const BOARD_CENTER = (BOARD_SQUARES - 1) / 2;

export function squareToPosition(square: Square, y = 0): Vector3 {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return new Vector3((file - BOARD_CENTER) * SQUARE_SIZE, y, (BOARD_CENTER - rank) * SQUARE_SIZE);
}

export function fileRankToPosition(file: number, rank: number, y = 0): Vector3 {
  return new Vector3((file - BOARD_CENTER) * SQUARE_SIZE, y, (BOARD_CENTER - rank) * SQUARE_SIZE);
}
