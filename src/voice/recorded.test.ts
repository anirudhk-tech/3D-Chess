import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RecordedSpeech,
  audioExtension,
  pickRecorderMimeType,
  transcribeWithOpenAI,
  type RecorderLike,
} from './recorded';

class FakeRecorder implements RecorderLike {
  mimeType = 'audio/webm';
  ondataavailable: RecorderLike['ondataavailable'] = null;
  onstop: RecorderLike['onstop'] = null;
  onerror: RecorderLike['onerror'] = null;
  started = false;
  constructor(private bytes: number) {}
  start() {
    this.started = true;
  }
  stop() {
    if (this.bytes > 0) {
      this.ondataavailable?.({
        data: new Blob([new Uint8Array(this.bytes)], { type: this.mimeType }),
      } as BlobEvent);
    }
    this.onstop?.(new Event('stop'));
  }
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

function namedError(name: string) {
  return Object.assign(new Error(name), { name });
}

interface SetupOptions {
  bytes?: number;
  mimeType?: string;
  text?: string;
  streamError?: Error;
  transcribe?: (audio: Blob, signal: AbortSignal) => Promise<string>;
}

function setup(options: SetupOptions = {}) {
  const recorder = new FakeRecorder(options.bytes ?? 5000);
  if (options.mimeType) recorder.mimeType = options.mimeType;
  const { stream, track } = fakeStream();
  const handlers = {
    onInterim: vi.fn(),
    onFinal: vi.fn(),
    onStatus: vi.fn(),
    onError: vi.fn(),
    onStateChange: vi.fn(),
  };
  const transcribe = vi.fn(
    options.transcribe ?? (async () => options.text ?? ' send the horse out '),
  );
  const speech = new RecordedSpeech(
    {
      getStream: async () => {
        if (options.streamError) throw options.streamError;
        return stream;
      },
      createRecorder: () => recorder,
      transcribe,
    },
    handlers,
  );
  return { speech, handlers, transcribe, recorder, track };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RecordedSpeech', () => {
  afterEach(() => vi.useRealTimers());

  it('records, transcribes and reports the final text', async () => {
    const { speech, handlers, transcribe, recorder } = setup();
    await speech.start();
    expect(recorder.started).toBe(true);
    expect(speech.isListening).toBe(true);
    speech.stop();
    await flush();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(handlers.onStatus).toHaveBeenCalledWith('Transcribing...');
    expect(handlers.onFinal).toHaveBeenCalledWith('send the horse out');
    expect(handlers.onStateChange).toHaveBeenLastCalledWith(false);
  });

  it('releases the microphone once recording ends', async () => {
    const { speech, track } = setup();
    await speech.start();
    expect(track.stop).not.toHaveBeenCalled();
    speech.stop();
    await flush();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('sends audio labelled with the recorder mime type', async () => {
    const { speech, transcribe } = setup({ mimeType: 'audio/mp4' });
    await speech.start();
    speech.stop();
    await flush();
    const audio = transcribe.mock.calls[0]![0];
    expect(audio.type).toBe('audio/mp4');
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'No microphone'],
    ['NotReadableError', 'in use'],
    ['SomethingElse', 'Could not open'],
  ])('maps %s to a readable microphone message', async (name, fragment) => {
    const { speech, handlers } = setup({ streamError: namedError(name) });
    await speech.start();
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining(fragment));
    expect(speech.isListening).toBe(false);
    expect(handlers.onStateChange).not.toHaveBeenCalled();
  });

  it('can start again after a denied permission', async () => {
    const { speech, handlers } = setup({ streamError: namedError('NotAllowedError') });
    await speech.start();
    await speech.start();
    expect(handlers.onError).toHaveBeenCalledTimes(2);
  });

  it('skips transcription when the recording is empty', async () => {
    const { speech, handlers, transcribe } = setup({ bytes: 0 });
    await speech.start();
    speech.stop();
    await flush();
    expect(transcribe).not.toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining('hear'));
  });

  it('surfaces transcription failures', async () => {
    const { speech, handlers } = setup({
      transcribe: async () => {
        throw new Error('boom');
      },
    });
    await speech.start();
    speech.stop();
    await flush();
    expect(handlers.onError).toHaveBeenCalledWith('boom');
    expect(handlers.onFinal).not.toHaveBeenCalled();
  });

  it('ignores a blank transcript', async () => {
    const { speech, handlers } = setup({ text: '   ' });
    await speech.start();
    speech.stop();
    await flush();
    expect(handlers.onFinal).not.toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalled();
  });

  it('drops the recording when released before the microphone is ready', async () => {
    const { speech, handlers, recorder, track } = setup();
    const starting = speech.start();
    speech.stop();
    await starting;
    expect(recorder.started).toBe(false);
    expect(speech.isListening).toBe(false);
    expect(handlers.onStateChange).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it('stops automatically at the recording limit', async () => {
    vi.useFakeTimers();
    const { speech, handlers } = setup();
    await speech.start();
    vi.advanceTimersByTime(14_999);
    expect(speech.isListening).toBe(true);
    vi.advanceTimersByTime(1);
    expect(speech.isListening).toBe(false);
    expect(handlers.onStateChange).toHaveBeenLastCalledWith(false);
  });

  it('releases the microphone when the recorder fails', async () => {
    const { speech, handlers, recorder, track } = setup();
    await speech.start();
    recorder.onerror?.(new Event('error') as ErrorEvent);
    expect(speech.isListening).toBe(false);
    expect(track.stop).toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining('Recording failed'));
  });

  it('aborts an in-flight transcription when a new recording starts', async () => {
    const signals: AbortSignal[] = [];
    const resolvers: ((text: string) => void)[] = [];
    const { speech, handlers } = setup({
      transcribe: (_audio, signal) => {
        signals.push(signal);
        return new Promise<string>((resolve) => resolvers.push(resolve));
      },
    });
    await speech.start();
    speech.stop();
    await flush();
    expect(signals[0]!.aborted).toBe(false);

    await speech.start();
    expect(signals[0]!.aborted).toBe(true);

    resolvers[0]!('stale order');
    await flush();
    expect(handlers.onFinal).not.toHaveBeenCalled();
  });

  it('cancels transcription and recording on dispose', async () => {
    const signals: AbortSignal[] = [];
    const { speech, handlers } = setup({
      transcribe: (_audio, signal) => {
        signals.push(signal);
        return new Promise<string>(() => {});
      },
    });
    await speech.start();
    speech.stop();
    await flush();
    speech.dispose();
    expect(signals[0]!.aborted).toBe(true);
    expect(handlers.onFinal).not.toHaveBeenCalled();
  });
});

describe('recorder format selection', () => {
  it('prefers webm where it is supported', () => {
    const supported = new Set(['audio/webm;codecs=opus', 'audio/webm']);
    expect(pickRecorderMimeType((type) => supported.has(type))).toBe('audio/webm;codecs=opus');
  });

  it('falls back to mp4 on Safari', () => {
    expect(pickRecorderMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4');
  });

  it('returns undefined when nothing is supported so the browser default applies', () => {
    expect(pickRecorderMimeType(() => false)).toBeUndefined();
  });

  it.each([
    ['audio/mp4', 'mp4'],
    ['audio/mp4;codecs=mp4a.40.2', 'mp4'],
    ['audio/ogg;codecs=opus', 'ogg'],
    ['audio/webm;codecs=opus', 'webm'],
    ['', 'webm'],
  ])('maps %s to .%s', (mime, extension) => {
    expect(audioExtension(mime)).toBe(extension);
  });
});

describe('transcribeWithOpenAI', () => {
  afterEach(() => vi.unstubAllGlobals());

  const audio = new Blob([new Uint8Array(10)], { type: 'audio/mp4' });
  const respond = (body: BodyInit | null, init?: ResponseInit) =>
    vi.fn(async (_url: string, _init?: RequestInit) => new Response(body, init));

  it('posts the audio with its real extension and returns the text', async () => {
    const fetchMock = respond(JSON.stringify({ text: 'e4' }), { status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await expect(transcribeWithOpenAI(audio, 'model-x')).resolves.toBe('e4');
    const body = fetchMock.mock.calls[0]![1]!.body as FormData;
    expect((body.get('file') as File).name).toBe('speech.mp4');
    expect(body.get('model')).toBe('model-x');
  });

  it('reports HTTP failures with status and a truncated detail', async () => {
    vi.stubGlobal('fetch', respond('x'.repeat(500), { status: 401 }));
    const error = await transcribeWithOpenAI(audio, 'm').catch((e: Error) => e);
    expect((error as Error).message).toMatch(/^Transcription failed \(401\): x{160}$/);
  });

  it('reports an unreachable service', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(transcribeWithOpenAI(audio, 'm')).rejects.toThrow(
      'Could not reach the transcription service.',
    );
  });

  it('reports a malformed response body', async () => {
    vi.stubGlobal('fetch', respond('<html>', { status: 200 }));
    await expect(transcribeWithOpenAI(audio, 'm')).rejects.toThrow('unreadable');
  });

  it('returns an empty string when the response has no text', async () => {
    vi.stubGlobal('fetch', respond('{}', { status: 200 }));
    await expect(transcribeWithOpenAI(audio, 'm')).resolves.toBe('');
  });

  it('rethrows aborts unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(transcribeWithOpenAI(audio, 'm')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
