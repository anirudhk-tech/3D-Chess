import type { Color, GameStatus } from '../engine/game';

const COLOR_NAMES: Record<Color, string> = { w: 'White', b: 'Black' };

const DRAW_REASONS = {
  stalemate: 'stalemate',
  insufficient: 'insufficient material',
  repetition: 'repetition',
  'fifty-move': 'fifty-move rule',
} as const;

export function describeGameStatus(status: GameStatus): string {
  if (!status.over) return `${COLOR_NAMES[status.turn]} to move${status.check ? ' (check)' : ''}`;
  if (status.result === 'checkmate') return `Checkmate. ${COLOR_NAMES[status.winner]} wins`;
  return `Draw (${DRAW_REASONS[status.reason]})`;
}
