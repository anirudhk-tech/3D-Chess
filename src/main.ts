import { Game, type PieceSymbol, type Square } from './engine/game';
import { ChessScene } from './scene/ChessScene';
import { fx } from './scene/fx';
import { interpret } from './commands/interpret';
import { chooseWithJev } from './commands/jev';
import { DIFFICULTIES, Opponent, type Difficulty } from './opponent/opponent';
import { SpeechInput, browserRecognitionFactory, type SpeechHandlers } from './voice/speech';
import { RecordedSpeech, browserRecorderDeps } from './voice/recorded';

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
    <button id="mic" type="button" title="Click, or hold Space, and speak an order">Mic</button>
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
  #mic { padding: 10px 14px; font-size: 14px; border-radius: 8px; border: 1px solid #444; background: #262a33; color: #eee; cursor: pointer; }
  #mic.listening { background: #b3261e; border-color: #e46962; }
  #mic:disabled { opacity: 0.4; cursor: not-allowed; }
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

async function handleCommand(text: string) {
  if (busy || game.turn !== PLAYER || game.status().over) return;
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
}

document.getElementById('command')!.addEventListener('submit', (e) => {
  e.preventDefault();
  void handleCommand(input.value.trim());
});

const micButton = document.getElementById('mic') as HTMLButtonElement;

interface Listener {
  start(): void | Promise<void>;
  stop(): void;
  toggle(): void;
}

const speechHandlers: SpeechHandlers = {
  onInterim: (text) => {
    input.value = text;
  },
  onFinal: (text) => {
    input.value = text;
    void handleCommand(text);
  },
  onError: (message) => {
    status.textContent = message;
  },
  onStateChange: (listening) => {
    micButton.classList.toggle('listening', listening);
    micButton.textContent = listening ? 'Listening...' : 'Mic';
    fx.duckAmbience(listening);
    if (listening) status.textContent = 'Listening...';
  },
};

const browserFactory = browserRecognitionFactory();
const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

let speech: Listener | undefined;
if (__OPENAI_STT_AVAILABLE__ && canRecord) {
  speech = new RecordedSpeech(browserRecorderDeps(__OPENAI_STT_MODEL__), speechHandlers);
} else if (browserFactory) {
  speech = new SpeechInput(browserFactory, {
    ...speechHandlers,
    onError: (message) => {
      status.textContent = message.includes('unreachable')
        ? 'Your browser cannot reach its speech service. Add OPENAI_API_KEY to .env and restart the dev server to use OpenAI transcription instead.'
        : message;
    },
  });
}

if (!speech) {
  micButton.disabled = true;
  micButton.title = 'Speech input is not available in this browser';
} else {
  const listener = speech;
  const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;

  micButton.addEventListener('click', () => {
    micButton.blur();
    if (busy || game.turn !== PLAYER) return;
    listener.toggle();
  });
  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || isTyping(event.target) || busy || game.turn !== PLAYER) return;
    event.preventDefault();
    void listener.start();
  });
  document.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' || isTyping(event.target)) return;
    listener.stop();
  });
}
