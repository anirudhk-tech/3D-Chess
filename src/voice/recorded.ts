import type { SpeechHandlers, VoiceInput } from './types';

export interface RecorderLike {
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: ((event: Event) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  start(): void;
  stop(): void;
}

export interface RecordedSpeechDeps {
  getStream: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => RecorderLike;
  transcribe: (audio: Blob, signal: AbortSignal) => Promise<string>;
}

const MAX_RECORDING_MS = 15_000;
const MIN_AUDIO_BYTES = 1500;
const DEFAULT_MIME_TYPE = 'audio/webm';
const TRANSCRIPTION_ENDPOINT = '/api/openai/v1/audio/transcriptions';
const ERROR_DETAIL_LIMIT = 160;
const VOCABULARY_PROMPT =
  'Chess commands to an army: pawn, soldier, knight, horse, bishop, priest, rook, tower, queen, king, attack, capture, back up, e4, f3.';

const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

const MICROPHONE_MESSAGES: Record<string, string> = {
  NotAllowedError: 'Microphone access was denied. Allow it in the browser address bar.',
  SecurityError: 'Microphone access was denied. Allow it in the browser address bar.',
  NotFoundError: 'No microphone found.',
  NotReadableError: 'The microphone is in use by another application.',
};

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

export function pickRecorderMimeType(isSupported: (type: string) => boolean): string | undefined {
  return RECORDER_MIME_CANDIDATES.find(isSupported);
}

export function audioExtension(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function firstNonEmpty(...candidates: (string | undefined)[]): string {
  return candidates.find((value) => value !== undefined && value !== '') ?? DEFAULT_MIME_TYPE;
}

export class RecordedSpeech implements VoiceInput {
  private recorder?: RecorderLike;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private listening = false;
  private starting = false;
  private stopsDuringStart = 0;
  private capTimer?: ReturnType<typeof setTimeout>;
  private transcription?: AbortController;

  constructor(
    private deps: RecordedSpeechDeps,
    private handlers: SpeechHandlers,
  ) {}

  get isListening() {
    return this.listening;
  }

  async start() {
    if (this.listening || this.starting) return;
    this.transcription?.abort();
    this.starting = true;
    const stopsBeforeStart = this.stopsDuringStart;
    let stream: MediaStream;
    try {
      stream = await this.deps.getStream();
    } catch (error) {
      this.starting = false;
      const name = error instanceof Error ? error.name : '';
      this.handlers.onError(MICROPHONE_MESSAGES[name] ?? 'Could not open the microphone.');
      return;
    }
    this.starting = false;
    if (this.stopsDuringStart !== stopsBeforeStart) {
      this.releaseStream(stream);
      return;
    }
    this.beginRecording(stream);
  }

  stop() {
    if (this.starting) this.stopsDuringStart++;
    if (!this.listening) return;
    this.listening = false;
    clearTimeout(this.capTimer);
    this.handlers.onStateChange(false);
    try {
      this.recorder?.stop();
    } catch {
      this.abandonRecording();
    }
  }

  toggle() {
    if (this.listening) this.stop();
    else void this.start();
  }

  dispose() {
    this.transcription?.abort();
    this.stopsDuringStart++;
    if (this.listening) {
      this.listening = false;
      clearTimeout(this.capTimer);
      this.handlers.onStateChange(false);
    }
    this.detachRecorder();
    this.releaseStream(this.stream);
    this.chunks = [];
  }

  private beginRecording(stream: MediaStream) {
    this.stream = stream;
    this.chunks = [];
    let recorder: RecorderLike;
    try {
      recorder = this.deps.createRecorder(stream);
    } catch {
      this.releaseStream(stream);
      this.handlers.onError('Recording is not supported in this browser.');
      return;
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onstop = () => void this.finish(recorder);
    recorder.onerror = () => {
      this.abandonRecording();
      this.handlers.onError('Recording failed. Try again.');
    };
    this.recorder = recorder;
    try {
      recorder.start();
    } catch {
      this.abandonRecording();
      this.handlers.onError('Recording failed. Try again.');
      return;
    }
    this.listening = true;
    this.handlers.onStateChange(true);
    this.capTimer = setTimeout(() => {
      this.stop();
    }, MAX_RECORDING_MS);
  }

  private abandonRecording() {
    clearTimeout(this.capTimer);
    this.detachRecorder();
    this.releaseStream(this.stream);
    this.chunks = [];
    if (this.listening) {
      this.listening = false;
      this.handlers.onStateChange(false);
    }
  }

  private detachRecorder() {
    if (!this.recorder) return;
    this.recorder.ondataavailable = null;
    this.recorder.onstop = null;
    this.recorder.onerror = null;
    this.recorder = undefined;
  }

  private releaseStream(stream: MediaStream | undefined) {
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    if (stream === this.stream) this.stream = undefined;
  }

  private async finish(recorder: RecorderLike) {
    const mimeType = firstNonEmpty(recorder.mimeType, this.chunks[0]?.type);
    const audio = new Blob(this.chunks, { type: mimeType });
    this.chunks = [];
    this.detachRecorder();
    this.releaseStream(this.stream);
    if (audio.size < MIN_AUDIO_BYTES) {
      this.handlers.onError("Didn't hear anything. Try again.");
      return;
    }
    this.handlers.onStatus('Transcribing...');
    const request = new AbortController();
    this.transcription = request;
    try {
      const text = (await this.deps.transcribe(audio, request.signal)).trim();
      if (request.signal.aborted) return;
      if (text) this.handlers.onFinal(text);
      else this.handlers.onError("Didn't catch that. Try again.");
    } catch (error) {
      if (request.signal.aborted || isAbort(error)) return;
      this.handlers.onError(error instanceof Error ? error.message : 'Transcription failed.');
    } finally {
      if (this.transcription === request) this.transcription = undefined;
    }
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, ERROR_DETAIL_LIMIT);
  } catch {
    return response.statusText;
  }
}

export async function transcribeWithOpenAI(
  audio: Blob,
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  form.append('file', audio, `speech.${audioExtension(audio.type)}`);
  form.append('model', model);
  form.append('language', 'en');
  form.append('prompt', VOCABULARY_PROMPT);

  let response: Response;
  try {
    response = await fetch(TRANSCRIPTION_ENDPOINT, { method: 'POST', body: form, signal });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new Error('Could not reach the transcription service.', { cause: error });
  }
  if (!response.ok) {
    throw new Error(
      `Transcription failed (${response.status}): ${await readErrorDetail(response)}`,
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Transcription service returned an unreadable response.');
  }
  const text = (data as { text?: unknown } | null)?.text;
  return typeof text === 'string' ? text : '';
}

export function browserRecorderDeps(model: string): RecordedSpeechDeps {
  return {
    getStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    createRecorder: (stream) => {
      const mimeType = pickRecorderMimeType((type) => MediaRecorder.isTypeSupported(type));
      return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    },
    transcribe: (audio, signal) => transcribeWithOpenAI(audio, model, signal),
  };
}
