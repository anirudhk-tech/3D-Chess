import { RecordedSpeech, browserRecorderDeps } from './recorded';
import { NETWORK_ERROR_MESSAGE, SpeechInput, type RecognitionFactory } from './speech';
import type { SpeechHandlers, VoiceInput } from './types';

export interface VoiceEnvironment {
  openAiTranscription: { model: string } | undefined;
  canRecord: boolean;
  recognitionFactory: RecognitionFactory | undefined;
}

const SPEECH_SERVICE_UNREACHABLE =
  'Your browser cannot reach its speech service. Add OPENAI_API_KEY to .env and restart the dev server to use OpenAI transcription instead.';

export function detectRecording(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export function createVoiceInput(
  environment: VoiceEnvironment,
  handlers: SpeechHandlers,
): VoiceInput | undefined {
  if (environment.openAiTranscription && environment.canRecord) {
    return new RecordedSpeech(browserRecorderDeps(environment.openAiTranscription.model), handlers);
  }
  if (environment.recognitionFactory) {
    return new SpeechInput(environment.recognitionFactory, {
      ...handlers,
      onError: (message) => {
        handlers.onError(message === NETWORK_ERROR_MESSAGE ? SPEECH_SERVICE_UNREACHABLE : message);
      },
    });
  }
  return undefined;
}
