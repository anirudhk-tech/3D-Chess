import type { Color, Game, MoveEvent, Piece, PieceSymbol, Square } from '../engine/game';
import type { Intent } from '../commands/types';
import type { Difficulty } from '../opponent/opponent';
import { describeGameStatus } from './statusText';

export const PLAYER_COLOR: Color = 'w';

export interface ScenePort {
  sync(pieces: Piece[]): void;
  animateMove(event: MoveEvent): Promise<void>;
}

export interface MoveChoice {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export interface OpponentPort {
  choose(fen: string, difficulty: Difficulty): Promise<MoveChoice | null>;
}

export interface TurnView {
  setStatus(text: string): void;
  clearInput(): void;
  setBusy(busy: boolean): void;
  readonly difficulty: Difficulty;
}

export interface DemoPosition {
  name: string;
  game: Game;
}

export interface GameControllerDeps {
  game: Game;
  scene: ScenePort;
  opponent: OpponentPort;
  interpret: (text: string, game: Game) => Promise<Intent>;
  view: TurnView;
  demo?: () => DemoPosition;
  random?: () => number;
}

export const MESSAGES = {
  opponentThinking: 'Opponent is thinking...',
  interpreting: 'Thinking...',
  illegalMove: 'That move is not legal',
  randomMove: 'Unclear order. A random piece moved.',
  failure: 'Something went wrong',
} as const;

const DEMO_COMMAND = 'game';

export class GameController {
  private game: Game;
  private working = false;
  private readonly random: () => number;

  constructor(private deps: GameControllerDeps) {
    this.game = deps.game;
    this.random = deps.random ?? Math.random;
    deps.scene.sync(this.game.pieces());
    deps.view.setStatus(describeGameStatus(this.game.status()));
  }

  get busy() {
    return this.working;
  }

  get canPlayerMove() {
    return !this.working && this.game.turn === PLAYER_COLOR && !this.game.status().over;
  }

  async submit(rawText: string): Promise<void> {
    if (this.working) return;
    const text = rawText.trim();
    if (this.deps.demo && text.toLowerCase() === DEMO_COMMAND) {
      this.loadDemo(this.deps.demo());
      return;
    }
    if (!text || !this.canPlayerMove) return;

    this.setWorking(true);
    try {
      await this.playTurn(text);
    } catch (error) {
      this.deps.view.setStatus(error instanceof Error ? error.message : MESSAGES.failure);
    } finally {
      this.setWorking(false);
    }
  }

  private setWorking(working: boolean) {
    this.working = working;
    this.deps.view.setBusy(working);
  }

  private loadDemo({ name, game }: DemoPosition) {
    this.game = game;
    this.deps.scene.sync(game.pieces());
    this.deps.view.clearInput();
    this.deps.view.setStatus(`${name}. ${describeGameStatus(game.status())}`);
  }

  private async playTurn(text: string) {
    const direct = this.game.move(text);
    if (direct) {
      this.deps.view.clearInput();
      await this.completePlayerMove(direct);
      return;
    }

    this.deps.view.setStatus(MESSAGES.interpreting);
    const intent = await this.deps.interpret(text, this.game);
    if (intent.kind !== 'move') {
      this.deps.view.setStatus(intent.message);
      return;
    }
    const event = this.game.move({ from: intent.from, to: intent.to, promotion: intent.promotion });
    if (!event) {
      this.deps.view.setStatus(MESSAGES.illegalMove);
      return;
    }
    this.deps.view.clearInput();
    await this.completePlayerMove(event, intent.random ? MESSAGES.randomMove : '');
  }

  private async completePlayerMove(event: MoveEvent, note = '') {
    await this.animate(event, note);
    await this.playOpponentTurn();
  }

  private async playOpponentTurn() {
    if (this.game.status().over || this.game.turn === PLAYER_COLOR) return;
    this.deps.view.setStatus(MESSAGES.opponentThinking);
    const event = await this.makeOpponentMove();
    if (event) await this.animate(event, `Opponent plays ${event.san}.`);
  }

  private async makeOpponentMove(): Promise<MoveEvent | null> {
    let choice: MoveChoice | null | undefined;
    try {
      choice = await this.deps.opponent.choose(this.game.fen, this.deps.view.difficulty);
    } catch {
      choice = undefined;
    }
    if (choice === null) return null;
    const played =
      choice && this.game.move({ from: choice.from, to: choice.to, promotion: choice.promotion });
    return played || this.playRandomLegalMove();
  }

  private playRandomLegalMove(): MoveEvent | null {
    const moves = this.game.legalMoves();
    const move = moves[Math.floor(this.random() * moves.length)];
    return move
      ? this.game.move({ from: move.from, to: move.to, promotion: move.promotion })
      : null;
  }

  private async animate(event: MoveEvent, note: string) {
    await this.deps.scene.animateMove(event);
    const status = describeGameStatus(this.game.status());
    this.deps.view.setStatus(note ? `${note} ${status}` : status);
  }
}
