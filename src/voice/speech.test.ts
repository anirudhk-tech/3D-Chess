import { describe, expect, it, vi } from 'vitest';
import { SpeechInput, type RecognitionEvent, type RecognitionLike } from './speech';

class FakeRecognition implements RecognitionLike {
  lang = '';
  continuous = true;
  interimResults = false;
  onresult: RecognitionLike['onresult'] = null;
  onerror: RecognitionLike['onerror'] = null;
  onend: RecognitionLike['onend'] = null;
  started = false;
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  emit(transcripts: { text: string; final: boolean }[], resultIndex = 0) {
    const results = transcripts.map((t) =>
      Object.assign([{ transcript: t.text }], { isFinal: t.final }),
    );
    this.onresult?.({ resultIndex, results } as unknown as RecognitionEvent);
  }
}

function setup() {
  const fake = new FakeRecognition();
  const handlers = {
    onInterim: vi.fn(),
    onFinal: vi.fn(),
    onStatus: vi.fn(),
    onError: vi.fn(),
    onStateChange: vi.fn(),
  };
  const input = new SpeechInput(() => fake, handlers);
  return { fake, handlers, input };
}

describe('SpeechInput', () => {
  it('configures one-shot recognition with interim results', () => {
    const { fake, input } = setup();
    input.start();
    expect(fake.started).toBe(true);
    expect(fake.continuous).toBe(false);
    expect(fake.interimResults).toBe(true);
    expect(fake.lang).toBe('en-US');
  });

  it('reports interim text then the final transcript', () => {
    const { fake, handlers, input } = setup();
    input.start();
    fake.emit([{ text: ' send the horse ', final: false }]);
    expect(handlers.onInterim).toHaveBeenCalledWith('send the horse');
    fake.emit([{ text: ' send the horse out ', final: true }]);
    expect(handlers.onFinal).toHaveBeenCalledWith('send the horse out');
  });

  it('tracks listening state through start and end', () => {
    const { handlers, input } = setup();
    input.start();
    expect(input.isListening).toBe(true);
    expect(handlers.onStateChange).toHaveBeenLastCalledWith(true);
    input.stop();
    expect(input.isListening).toBe(false);
    expect(handlers.onStateChange).toHaveBeenLastCalledWith(false);
  });

  it('ignores a second start while already listening', () => {
    const factory = vi.fn(() => new FakeRecognition());
    const input = new SpeechInput(factory, {
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
      onStateChange: vi.fn(),
    });
    input.start();
    input.start();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('maps known errors to friendly messages', () => {
    const { fake, handlers, input } = setup();
    input.start();
    fake.onerror?.({ error: 'not-allowed' });
    expect(handlers.onError).toHaveBeenLastCalledWith(expect.stringContaining('denied'));
    fake.onerror?.({ error: 'weird' });
    expect(handlers.onError).toHaveBeenLastCalledWith('Speech recognition error: weird');
  });

  it('does not report an aborted recognition as an error', () => {
    const { fake, handlers, input } = setup();
    input.start();
    fake.onerror?.({ error: 'aborted' });
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('recovers when the browser refuses to start recognition', () => {
    const fake = new FakeRecognition();
    fake.start = () => {
      throw new Error('already started');
    };
    const handlers = {
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
      onStateChange: vi.fn(),
    };
    const input = new SpeechInput(() => fake, handlers);
    input.start();
    expect(input.isListening).toBe(false);
    expect(handlers.onStateChange).toHaveBeenLastCalledWith(false);
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining('microphone'));
  });

  it('aborts and goes quiet on dispose', () => {
    const { fake, handlers, input } = setup();
    input.start();
    input.dispose();
    expect(input.isListening).toBe(false);
    fake.emit([{ text: 'late', final: true }]);
    expect(handlers.onFinal).not.toHaveBeenCalled();
  });

  it('toggles between listening and stopped', () => {
    const { input } = setup();
    input.toggle();
    expect(input.isListening).toBe(true);
    input.toggle();
    expect(input.isListening).toBe(false);
  });
});
