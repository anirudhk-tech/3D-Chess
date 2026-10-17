import { describe, expect, it, vi } from 'vitest';
import type { Intent } from '../commands/types';
import { Game, type MoveEvent } from '../engine/game';
import type { Difficulty } from '../opponent/opponent';
import { GameController, MESSAGES, type MoveChoice } from './gameController';

const played = (game: Game) =>
  game
    .recentMoves(100)
    .reverse()
    .map((event) => event.san);

const CHECKMATE_IN_ONE = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Options {
  fen?: string;
  intent?: Intent | (() => Promise<Intent>);
  opponentChoice?: MoveChoice | null | Error;
  animate?: () => Promise<void>;
  demo?: boolean;
  difficulty?: Difficulty;
}

function setup(options: Options = {}) {
  const game = new Game(options.fen);
  const statuses: string[] = [];
  const view = {
    setStatus: vi.fn((text: string) => void statuses.push(text)),
    clearInput: vi.fn(),
    setBusy: vi.fn(),
    difficulty: options.difficulty ?? ('normal'),
  };
  const scene = {
    sync: vi.fn(),
    animateMove: vi.fn(async (_event: MoveEvent) => options.animate?.()),
  };
  const opponent = {
    choose: vi.fn(async () => {
      if (options.opponentChoice instanceof Error) throw options.opponentChoice;
      return options.opponentChoice === undefined
        ? { from: 'e7' as const, to: 'e5' as const }
        : options.opponentChoice;
    }),
  };
  const interpret = vi.fn(async (): Promise<Intent> => {
    const intent = options.intent ?? { kind: 'none', message: 'No idea' };
    return typeof intent === 'function' ? intent() : intent;
  });
  const demoGame = new Game(CHECKMATE_IN_ONE);
  const controller = new GameController({
    game,
    scene,
    opponent,
    interpret,
    view,
    demo: options.demo ? () => ({ name: 'Demo', game: demoGame }) : undefined,
    random: () => 0,
  });
  return { controller, game, view, scene, opponent, interpret, statuses, demoGame };
}

describe('GameController', () => {
  it('shows the initial status and draws the pieces', () => {
    const { scene, game, statuses } = setup();
    expect(scene.sync).toHaveBeenCalledWith(game.pieces());
    expect(statuses).toEqual(['White to move']);
  });

  it('plays a typed move, animates it, then plays and animates the opponent reply', async () => {
    const { controller, game, scene, opponent, view, statuses, interpret } = setup({
      difficulty: 'hard',
    });
    await controller.submit('  e4 ');
    expect(interpret).not.toHaveBeenCalled();
    expect(view.clearInput).toHaveBeenCalledTimes(1);
    expect(scene.animateMove.mock.calls.map(([event]) => event.san)).toEqual(['e4', 'e5']);
    expect(opponent.choose).toHaveBeenCalledWith(expect.stringContaining(' b '), 'hard');
    expect(played(game)).toEqual(['e4', 'e5']);
    expect(statuses.slice(-3)).toEqual([
      'Black to move',
      MESSAGES.opponentThinking,
      'Opponent plays e5. White to move',
    ]);
    expect(controller.busy).toBe(false);
  });

  it('interprets free text and plays the chosen move', async () => {
    const { controller, game, interpret } = setup({
      intent: { kind: 'move', from: 'g1', to: 'f3', random: false },
    });
    await controller.submit('send the horse out');
    expect(interpret).toHaveBeenCalledWith('send the horse out', game);
    expect(played(game)[0]).toBe('Nf3');
    expect(played(game)).toHaveLength(2);
  });

  it('tells the player when the interpreter picked a random move', async () => {
    const { controller, statuses } = setup({
      intent: { kind: 'move', from: 'e2', to: 'e4', random: true },
    });
    await controller.submit('gibberish');
    expect(statuses.at(-1)).toBe(`Opponent plays e5. White to move`);
    expect(statuses).toContain(`${MESSAGES.randomMove} Black to move`);
  });

  it('reports an unintelligible order without touching the board', async () => {
    const { controller, game, scene, opponent, view, statuses } = setup({
      intent: { kind: 'none', message: 'Say that again' },
    });
    await controller.submit('mumble');
    expect(statuses.at(-1)).toBe('Say that again');
    expect(played(game)).toEqual([]);
    expect(scene.animateMove).not.toHaveBeenCalled();
    expect(opponent.choose).not.toHaveBeenCalled();
    expect(view.clearInput).not.toHaveBeenCalled();
    expect(controller.busy).toBe(false);
  });

  it('rejects an illegal interpreted move and keeps the input', async () => {
    const { controller, game, view, statuses } = setup({
      intent: { kind: 'move', from: 'e2', to: 'e5', random: false },
    });
    await controller.submit('jump the pawn');
    expect(statuses.at(-1)).toBe(MESSAGES.illegalMove);
    expect(played(game)).toEqual([]);
    expect(view.clearInput).not.toHaveBeenCalled();
  });

  it('ignores blank input', async () => {
    const { controller, interpret, scene } = setup();
    await controller.submit('   ');
    expect(interpret).not.toHaveBeenCalled();
    expect(scene.animateMove).not.toHaveBeenCalled();
  });

  it('ignores a second submission while the first is in progress', async () => {
    const pending = deferred<Intent>();
    const { controller, interpret, view } = setup({ intent: () => pending.promise });
    const first = controller.submit('first order');
    expect(controller.busy).toBe(true);
    expect(controller.canPlayerMove).toBe(false);
    await controller.submit('second order');
    expect(interpret).toHaveBeenCalledTimes(1);
    pending.resolve({ kind: 'none', message: 'done' });
    await first;
    expect(controller.busy).toBe(false);
    expect(view.setBusy.mock.calls).toEqual([[true], [false]]);
  });

  it('clears the busy flag and shows the error when the interpreter throws', async () => {
    const { controller, statuses } = setup({
      intent: async () => {
        throw new Error('Model unreachable');
      },
    });
    await controller.submit('order');
    expect(statuses.at(-1)).toBe('Model unreachable');
    expect(controller.busy).toBe(false);
    expect(controller.canPlayerMove).toBe(true);
  });

  it('clears the busy flag when the animation throws during a typed move', async () => {
    const { controller, statuses } = setup({
      animate: async () => {
        throw new Error('render failed');
      },
    });
    await expect(controller.submit('e4')).resolves.toBeUndefined();
    expect(statuses.at(-1)).toBe('render failed');
    expect(controller.busy).toBe(false);
  });

  it('falls back to a legal move when the opponent crashes', async () => {
    const { controller, game } = setup({ opponentChoice: new Error('worker died') });
    await controller.submit('e4');
    expect(played(game)).toHaveLength(2);
    expect(game.turn).toBe('w');
  });

  it('falls back to a legal move when the opponent suggests an illegal one', async () => {
    const { controller, game } = setup({ opponentChoice: { from: 'e7', to: 'e1' } });
    await controller.submit('e4');
    expect(played(game)).toHaveLength(2);
  });

  it('leaves the turn alone when the opponent has no move', async () => {
    const { controller, game, scene } = setup({ opponentChoice: null });
    await controller.submit('e4');
    expect(played(game)).toEqual(['e4']);
    expect(scene.animateMove).toHaveBeenCalledTimes(1);
    expect(controller.busy).toBe(false);
  });

  it('does not ask the opponent to move after the player delivers checkmate', async () => {
    const { controller, opponent, statuses } = setup({ fen: CHECKMATE_IN_ONE });
    await controller.submit('Ra8');
    expect(opponent.choose).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toBe('Checkmate. White wins');
    expect(controller.canPlayerMove).toBe(false);
  });

  it('accepts no orders once the game is over', async () => {
    const { controller, interpret, scene } = setup({ fen: CHECKMATE_IN_ONE });
    await controller.submit('Ra8');
    scene.animateMove.mockClear();
    await controller.submit('anything');
    expect(interpret).not.toHaveBeenCalled();
    expect(scene.animateMove).not.toHaveBeenCalled();
  });

  describe('dev demo command', () => {
    it('loads the demo position when enabled, case-insensitively', async () => {
      const { controller, scene, view, statuses, interpret, demoGame } = setup({ demo: true });
      await controller.submit('GAME');
      expect(scene.sync).toHaveBeenLastCalledWith(demoGame.pieces());
      expect(view.clearInput).toHaveBeenCalled();
      expect(statuses.at(-1)).toBe('Demo. White to move');
      expect(interpret).not.toHaveBeenCalled();
    });

    it('plays on from the loaded position', async () => {
      const { controller, scene } = setup({ demo: true });
      await controller.submit('game');
      await controller.submit('Ra8');
      expect(scene.animateMove.mock.calls.at(-1)![0].checkmate).toBe(true);
    });

    it('is treated as an ordinary order when the demo is not provided (production)', async () => {
      const { controller, scene, interpret } = setup({ demo: false });
      const baselineSyncs = scene.sync.mock.calls.length;
      await controller.submit('game');
      expect(interpret).toHaveBeenCalledWith('game', expect.anything());
      expect(scene.sync.mock.calls.length).toBe(baselineSyncs);
    });
  });
});
