import { Game } from './engine/game';
import { ChessScene } from './scene/ChessScene';

const app = document.getElementById('app')!;
app.innerHTML = `
  <div id="viewport"></div>
  <form id="command">
    <input id="move" autocomplete="off" placeholder="Move in SAN, e.g. e4, Nf3, O-O" autofocus />
    <span id="status"></span>
  </form>
`;

const style = document.createElement('style');
style.textContent = `
  html, body { margin: 0; height: 100%; background: #1a1c22; font-family: system-ui, sans-serif; }
  #app { position: relative; height: 100%; }
  #viewport { position: absolute; inset: 0; }
  #command { position: absolute; left: 16px; bottom: 16px; display: flex; gap: 12px; align-items: center; }
  #move { padding: 10px 14px; width: 280px; font-size: 16px; border-radius: 8px; border: 1px solid #444; background: #262a33; color: #eee; }
  #status { color: #cfd3dc; font-size: 14px; }
`;
document.head.appendChild(style);

const game = new Game();
const scene = new ChessScene(document.getElementById('viewport')!);
scene.sync(game.pieces());

const input = document.getElementById('move') as HTMLInputElement;
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

document.getElementById('command')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  if (!text) return;
  const event = game.move(text);
  if (!event) {
    status.textContent = `Illegal move: ${text}`;
    return;
  }
  input.value = '';
  busy = true;
  await scene.animateMove(event);
  busy = false;
  status.textContent = describeStatus();
});
