export interface SpeechHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onStatus: (message: string) => void;
  onError: (message: string) => void;
  onStateChange: (listening: boolean) => void;
}

export interface VoiceInput {
  readonly isListening: boolean;
  start(): void | Promise<void>;
  stop(): void;
  toggle(): void;
  dispose(): void;
}
