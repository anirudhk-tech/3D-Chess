import type { VoiceInput } from '../voice/types';

export interface VoiceControls {
  toggle(): void;
  press(): void;
  release(): void;
}

export function createVoiceControls(voice: VoiceInput, canListen: () => boolean): VoiceControls {
  return {
    toggle() {
      if (voice.isListening) voice.stop();
      else if (canListen()) void voice.start();
    },
    press() {
      if (!voice.isListening && canListen()) void voice.start();
    },
    release() {
      voice.stop();
    },
  };
}
