import type { SpeechHandlers } from './speech';

export interface RecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface RecordedSpeechDeps {
  getStream: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => RecorderLike;
  transcribe: (audio: Blob) => Promise<string>;
}

const MAX_SECONDS = 15;
const MIN_BYTES = 1500;

export class RecordedSpeech {
  private recorder?: RecorderLike;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private listening = false;
  private starting = false;
  private stopRequested = false;
  private cap?: ReturnType<typeof setTimeout>;

  constructor(
    private deps: RecordedSpeechDeps,
    private handlers: SpeechHandlers,
  ) {}

  get isListening() {
    return this.listening;
  }

  async start() {
    if (this.listening || this.starting) return;
    this.starting = true;
    this.stopRequested = false;
    try {
      this.stream = await this.deps.getStream();
    } catch {
      this.starting = false;
      this.handlers.onError('Microphone access was denied. Allow it in the browser address bar.');
      return;
    }
    this.starting = false;
    if (this.stopRequested) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = undefined;
      return;
    }

    const recorder = this.deps.createRecorder(this.stream);
    this.chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onstop = () => void this.finish();
    this.recorder = recorder;
    this.listening = true;
    this.handlers.onStateChange(true);
    recorder.start();
    this.cap = setTimeout(() => this.stop(), MAX_SECONDS * 1000);
  }

  stop() {
    if (this.starting) this.stopRequested = true;
    if (!this.listening) return;
    clearTimeout(this.cap);
    this.listening = false;
    this.handlers.onStateChange(false);
    this.recorder?.stop();
  }

  toggle() {
    if (this.listening) this.stop();
    else void this.start();
  }

  private async finish() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    const audio = new Blob(this.chunks, { type: this.chunks[0]?.type || 'audio/webm' });
    this.chunks = [];
    if (audio.size < MIN_BYTES) {
      this.handlers.onError("Didn't hear anything. Try again.");
      return;
    }
    this.handlers.onInterim('Transcribing...');
    try {
      const text = (await this.deps.transcribe(audio)).trim();
      if (!text) this.handlers.onError("Didn't catch that. Try again.");
      else this.handlers.onFinal(text);
    } catch (error) {
      this.handlers.onError(error instanceof Error ? error.message : 'Transcription failed.');
    }
  }
}

export async function transcribeWithOpenAI(audio: Blob, model: string): Promise<string> {
  const form = new FormData();
  const extension = audio.type.includes('mp4') ? 'mp4' : 'webm';
  form.append('file', audio, `speech.${extension}`);
  form.append('model', model);
  form.append('language', 'en');
  form.append(
    'prompt',
    'Chess commands to an army: pawn, soldier, knight, horse, bishop, priest, rook, tower, queen, king, attack, capture, back up, e4, f3.',
  );
  let response: Response;
  try {
    response = await fetch('/api/openai/v1/audio/transcriptions', { method: 'POST', body: form });
  } catch {
    throw new Error('Could not reach the transcription proxy. Is the dev server running?');
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Transcription failed (${response.status}): ${detail.slice(0, 160)}`);
  }
  const data = await response.json();
  return String(data.text ?? '');
}

export function browserRecorderDeps(model: string): RecordedSpeechDeps {
  return {
    getStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    createRecorder: (stream) => new MediaRecorder(stream) as unknown as RecorderLike,
    transcribe: (audio) => transcribeWithOpenAI(audio, model),
  };
}
