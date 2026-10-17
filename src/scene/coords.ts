import { Vector3 } from 'three';
import type { Square } from '../engine/game';

export const SQUARE_SIZE = 1;

export function squareToPosition(square: Square, y = 0): Vector3 {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return new Vector3((file - 3.5) * SQUARE_SIZE, y, (3.5 - rank) * SQUARE_SIZE);
}
