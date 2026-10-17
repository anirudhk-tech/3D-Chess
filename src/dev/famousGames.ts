import { Game } from '../engine/game';

export interface FamousPosition {
  name: string;
  moves: string[];
}

export const IMMORTAL_GAME: FamousPosition = {
  name: 'The Immortal Game (Anderssen vs Kieseritzky, 1851), after 17...Qxb2',
  moves: [
    'e4',
    'e5',
    'f4',
    'exf4',
    'Bc4',
    'Qh4+',
    'Kf1',
    'b5',
    'Bxb5',
    'Nf6',
    'Nf3',
    'Qh6',
    'd3',
    'Nh5',
    'Nh4',
    'Qg5',
    'Nf5',
    'c6',
    'g4',
    'Nf6',
    'Rg1',
    'cxb5',
    'h4',
    'Qg6',
    'h5',
    'Qg5',
    'Qf3',
    'Ng8',
    'Bxf4',
    'Qf6',
    'Nc3',
    'Bc5',
    'Nd5',
    'Qxb2',
  ],
};

export function loadPosition(position: FamousPosition): Game {
  const game = new Game();
  for (const move of position.moves) {
    if (!game.move(move)) throw new Error(`Illegal move ${move} while loading ${position.name}`);
  }
  return game;
}
