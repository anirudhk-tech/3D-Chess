import { describe, expect, it, vi } from 'vitest';
import { RecordedSpeech, type RecorderLike } from './recorded';

class FakeRecorder implements RecorderLike {
  ondataavailable: RecorderLike['ondataavailable'] = null;
  onstop: RecorderLike['onstop'] = null;
  started = false;
  constructor(private bytes: number) {}
  start() {
    this.started = true;
  }
  stop() {
    if (this.bytes > 0) this.ondataavailable?.({ data: new Blob([new Uint8Array(this.bytes)], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const fakeStream = () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream;

function setup(options: { bytes?: number; text?: string; streamFails?: boolean; transcribeFails?: boolean } = {}) {
  const recorder = new FakeRecorder(options.bytes ?? 5000);
  const handlers = { onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn(), onStateChange: vi.fn() };
  const transcribe = vi.fn(async () => {
    if (options.transcribeFails) throw new Error('boom');
    return options.text ?? ' send the horse out ';
  });
  const speech = new RecordedSpeech(
    {
      getStream: async () => {
        if (options.streamFails) throw new Error('denied');
        return fakeStream();
      },
      createRecorder: () => recorder,
      transcribe,
    },
    handlers,
  );
  return { speech, handlers, transcribe, recorder };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RecordedSpeech', () => {
  it('records, transcribes and reports the final text', async () => {
    const { speech, handlers, transcribe, recorder } = setup();
    await speech.start();
    expect(recorder.started).toBe(true);
    expect(speech.isListening).toBe(true);
    speech.stop();
    await flush();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(handlers.onInterim).toHaveBeenCalledWith('Transcribing...');
    expect(handlers.onFinal).toHaveBeenCalledWith('send the horse out');
    expect(handlers.onStateChange).toHaveBeenLastCalledWith(false);
  });

  it('reports a friendly error when the microphone is denied', async () => {
    const { speech, handlers } = setup({ streamFails: true });
    await speech.start();
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining('denied'));
    expect(speech.isListening).toBe(false);
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
    const { speech, handlers } = setup({ transcribeFails: true });
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
    const { speech, handlers, recorder } = setup();
    const starting = speech.start();
    speech.stop();
    await starting;
    expect(recorder.started).toBe(false);
    expect(speech.isListening).toBe(false);
    expect(handlers.onStateChange).not.toHaveBeenCalled();
  });
});
