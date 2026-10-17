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

export interface SpeechHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onStateChange: (listening: boolean) => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was denied. Allow it in the browser address bar.',
  'service-not-allowed': 'Microphone access was denied. Allow it in the browser address bar.',
  'no-speech': "Didn't hear anything. Try again.",
  'audio-capture': 'No microphone found.',
  network: 'Speech service unreachable. Check your connection.',
};

export function browserRecognitionFactory(): RecognitionFactory | undefined {
  const Ctor = (window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike })
    .SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => RecognitionLike }).webkitSpeechRecognition;
  return Ctor ? () => new Ctor() : undefined;
}

export class SpeechInput {
  private recognition?: RecognitionLike;
  private listening = false;
  private heardFinal = false;

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
    this.heardFinal = false;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final.trim()) {
        this.heardFinal = true;
        this.handlers.onFinal(final.trim());
      } else if (interim.trim()) {
        this.handlers.onInterim(interim.trim());
      }
    };
    recognition.onerror = (event) => {
      this.handlers.onError(ERROR_MESSAGES[event.error] ?? `Speech recognition error: ${event.error}`);
    };
    recognition.onend = () => {
      this.listening = false;
      this.recognition = undefined;
      this.handlers.onStateChange(false);
    };

    this.recognition = recognition;
    this.listening = true;
    this.handlers.onStateChange(true);
    try {
      recognition.start();
    } catch {
      this.listening = false;
      this.recognition = undefined;
      this.handlers.onStateChange(false);
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
}
