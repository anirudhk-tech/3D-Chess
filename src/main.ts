import { Game, type PieceSymbol, type Square } from './engine/game';
import { ChessScene } from './scene/ChessScene';
import { fx } from './scene/fx';
import { interpret } from './commands/interpret';
import { chooseWithJev } from './commands/jev';
import { DIFFICULTIES, Opponent, type Difficulty } from './opponent/opponent';

const app = document.getElementById('app')!;
app.innerHTML = `
  <div id="viewport"></div>
  <form id="command">
    <input id="move" autocomplete="off" placeholder="Give an order, e.g. send the horse out" autofocus />
    <select id="level">
      <option value="easy">Easy</option>
      <option value="normal" selected>Normal</option>
      <option value="hard">Hard</option>
    </select>
    <button id="sound" type="button">Sound: on</button>
    <span id="status"></span>
  </form>
`;

const style = document.createElement('style');
style.textContent = `
  html, body { margin: 0; height: 100%; background: #1a1c22; font-family: system-ui, sans-serif; }
  #app { position: relative; height: 100%; }
  #viewport { position: absolute; inset: 0; }
  #command { position: absolute; left: 16px; bottom: 16px; display: flex; gap: 12px; align-items: center; }
  #move { padding: 10px 14px; width: 380px; font-size: 16px; border-radius: 8px; border: 1px solid #444; background: #262a33; color: #eee; }
  #level { padding: 10px 12px; font-size: 14px; border-radius: 8px; border: 1px solid #444; background: #262a33; color: #eee; }
  #sound { padding: 10px 14px; font-size: 14px; border-radius: 8px; border: 1px solid #444; background: #262a33; color: #eee; cursor: pointer; }
  #status { color: #cfd3dc; font-size: 14px; }
`;
document.head.appendChild(style);

const game = new Game();
const scene = new ChessScene(document.getElementById('viewport')!);
scene.sync(game.pieces());

const input = document.getElementById('move') as HTMLInputElement;
const soundButton = document.getElementById('sound') as HTMLButtonElement;
let muted = false;

document.addEventListener('pointerdown', () => fx.unlock());
document.addEventListener('keydown', () => fx.unlock());
soundButton.addEventListener('click', () => {
  muted = !muted;
  fx.setMuted(muted);
  soundButton.textContent = muted ? 'Sound: off' : 'Sound: on';
});
const status = document.getElementById('status')!;
let busy = false;

function describeStatus() {
  const s = game.status();
  if (s.over) {
    return s.result === 'checkmate' ? `Checkmate. ${s.winner === 'w' ? 'White' : 'Black'} wins` : `Draw (${s.reason})`;
  }
  return `${s.turn === 'w' ? 'White' : 'Black'} to move${s.check ? ' (check)' : ''}`;
}

status.textContent = describeStatus();

const levelSelect = document.getElementById('level') as HTMLSelectElement;
const opponent = new Opponent();
const PLAYER = 'w';

function pickRandomLegal() {
  const moves = game.legalMoves();
  const move = moves[Math.floor(Math.random() * moves.length)]!;
  return { from: move.from, to: move.to, promotion: move.promotion };
}

async function animate(event: NonNullable<ReturnType<Game['move']>>, note = '') {
  await scene.animateMove(event);
  status.textContent = note ? `${note} ${describeStatus()}` : describeStatus();
}

async function opponentTurn() {
  if (game.status().over || game.turn === PLAYER) return;
  status.textContent = 'The enemy commander is thinking...';
  let choice: { from: Square; to: Square; promotion?: PieceSymbol };
  try {
    const found = await opponent.choose(game.fen, levelSelect.value as Difficulty);
    if (!found) return;
    choice = found;
  } catch {
    choice = pickRandomLegal();
  }
  const event = game.move({ from: choice.from, to: choice.to, promotion: choice.promotion });
  if (event) await animate(event, `Enemy plays ${event.san}.`);
}

async function playerMove(event: NonNullable<ReturnType<Game['move']>>, note = '') {
  await animate(event, note);
  await opponentTurn();
}

document.getElementById('command')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy || game.turn !== PLAYER || game.status().over) return;
  const text = input.value.trim();
  if (!text) return;

  const direct = game.move(text);
  if (direct) {
    input.value = '';
    busy = true;
    try {
      await playerMove(direct);
    } finally {
      busy = false;
    }
    return;
  }

  busy = true;
  status.textContent = 'Thinking...';
  try {
    const intent = await interpret(text, game, chooseWithJev, { minConfidence: __JEV_MIN_CONFIDENCE__ });
    if (intent.kind !== 'move') {
      status.textContent = intent.message;
      return;
    }
    const event = game.move({ from: intent.from, to: intent.to, promotion: intent.promotion });
    if (!event) {
      status.textContent = 'That move is not legal';
      return;
    }
    input.value = '';
    await playerMove(event, intent.random ? 'Not sure what you meant, so a piece moved at random.' : '');
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Something went wrong';
  } finally {
    busy = false;
  }
});
