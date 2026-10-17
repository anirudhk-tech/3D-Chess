import { bindAudioUnlock } from './app/audioUnlock';
import { GameController } from './app/gameController';
import { bindKeys } from './app/keyBindings';
import { createVoiceControls } from './app/voiceControls';
import { IMMORTAL_GAME, loadPosition } from './dev/famousGames';
import { interpret } from './commands/interpret';
import { chooseWithJev } from './commands/jev';
import { Game } from './engine/game';
import { Opponent } from './opponent/opponent';
import { ChessScene } from './scene/ChessScene';
import { fx } from './scene/fx';
import { AppView } from './ui/appView';
import { createVoiceInput, detectRecording } from './voice/createVoiceInput';
import { browserRecognitionFactory } from './voice/speech';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

let soundOn = true;

const view = new AppView(root, {
  onSubmit: (text) => void controller.submit(text),
  onMicClick: () => voiceControls?.toggle(),
  onSoundClick: () => {
    soundOn = !soundOn;
    fx.setMuted(!soundOn);
    view.setSoundOn(soundOn);
  },
});

const scene = new ChessScene(view.viewport);

const controller = new GameController({
  game: new Game(),
  scene,
  opponent: new Opponent(),
  interpret: (text, game) =>
    interpret(text, game, chooseWithJev, { minConfidence: __JEV_MIN_CONFIDENCE__ }),
  view,
  demo: import.meta.env.DEV
    ? () => ({ name: IMMORTAL_GAME.name, game: loadPosition(IMMORTAL_GAME) })
    : undefined,
});

const voice = createVoiceInput(
  {
    openAiTranscription: __OPENAI_STT_AVAILABLE__ ? { model: __OPENAI_STT_MODEL__ } : undefined,
    canRecord: detectRecording(),
    recognitionFactory: browserRecognitionFactory(),
  },
  {
    onInterim: (text) => {
      view.setInput(text);
    },
    onFinal: (text) => {
      view.setInput(text);
      void controller.submit(text);
    },
    onStatus: (message) => {
      view.setStatus(message);
    },
    onError: (message) => {
      view.setStatus(message);
    },
    onStateChange: (listening) => {
      view.setListening(listening);
      fx.duckAmbience(listening);
      if (listening) view.setStatus('Listening...');
    },
  },
);

const voiceControls = voice && createVoiceControls(voice, () => controller.canPlayerMove);
if (!voice) view.disableMic('Speech input is not available in this browser');

const disposers = [
  bindAudioUnlock(() => {
    fx.unlock();
  }),
  bindKeys({
    toggleView: () => {
      scene.toggleView();
    },
    startListening: () => voiceControls?.press(),
    stopListening: () => voiceControls?.release(),
  }),
];

import.meta.hot?.dispose(() => {
  disposers.forEach((dispose) => {
    dispose();
  });
  voice?.dispose();
});
