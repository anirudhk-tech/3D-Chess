import type { SpeechHandlers, VoiceInput } from './types';

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}

export interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionFactory = () => RecognitionLike;

type RecognitionConstructor = new () => RecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
}

const MICROPHONE_DENIED = 'Microphone access was denied. Allow it in the browser address bar.';

export const NETWORK_ERROR_MESSAGE = 'Speech service unreachable. Check your connection.';

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': MICROPHONE_DENIED,
  'service-not-allowed': MICROPHONE_DENIED,
  'no-speech': "Didn't hear anything. Try again.",
  'audio-capture': 'No microphone found.',
  network: NETWORK_ERROR_MESSAGE,
};

const SILENT_ERRORS = new Set(['aborted']);

export function browserRecognitionFactory(
  scope = window as SpeechWindow,
): RecognitionFactory | undefined {
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return Recognition ? () => new Recognition() : undefined;
}

export class SpeechInput implements VoiceInput {
  private recognition?: RecognitionLike;
  private listening = false;

  constructor(
    private factory: RecognitionFactory,
    private handlers: SpeechHandlers,
    private lang = 'en-US',
  ) {}

  get isListening() {
    return this.listening;
  }

  start() {
    if (this.listening) return;
    const recognition = this.factory();
    recognition.lang = this.lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      this.handleResult(event);
    };
    recognition.onerror = (event) => {
      if (!SILENT_ERRORS.has(event.error)) {
        this.handlers.onError(
          ERROR_MESSAGES[event.error] ?? `Speech recognition error: ${event.error}`,
        );
      }
    };
    recognition.onend = () => {
      this.end(recognition);
    };

    this.recognition = recognition;
    this.listening = true;
    this.handlers.onStateChange(true);
    try {
      recognition.start();
    } catch {
      this.end(recognition);
      this.handlers.onError('Could not start the microphone.');
    }
  }

  stop() {
    this.recognition?.stop();
  }

  toggle() {
    if (this.listening) this.stop();
    else this.start();
  }

  dispose() {
    this.recognition?.abort();
  }

  private handleResult(event: RecognitionEvent) {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result) continue;
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (final.trim()) this.handlers.onFinal(final.trim());
    else if (interim.trim()) this.handlers.onInterim(interim.trim());
  }

  private end(recognition: RecognitionLike) {
    if (this.recognition !== recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    this.recognition = undefined;
    this.listening = false;
    this.handlers.onStateChange(false);
  }
}
