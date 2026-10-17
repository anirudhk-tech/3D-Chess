import { describe, expect, it, vi } from 'vitest';
import { createVoiceInput } from './createVoiceInput';
import { NETWORK_ERROR_MESSAGE, SpeechInput, type RecognitionLike } from './speech';
import { RecordedSpeech } from './recorded';

const handlers = () => ({
  onInterim: vi.fn(),
  onFinal: vi.fn(),
  onStatus: vi.fn(),
  onError: vi.fn(),
  onStateChange: vi.fn(),
});
const recognition = () => ({}) as RecognitionLike;

describe('createVoiceInput', () => {
  it('prefers OpenAI transcription when configured and recording is possible', () => {
    const input = createVoiceInput(
      { openAiTranscription: { model: 'm' }, canRecord: true, recognitionFactory: recognition },
      handlers(),
    );
    expect(input).toBeInstanceOf(RecordedSpeech);
  });

  it('falls back to browser recognition when recording is unavailable', () => {
    const input = createVoiceInput(
      { openAiTranscription: { model: 'm' }, canRecord: false, recognitionFactory: recognition },
      handlers(),
    );
    expect(input).toBeInstanceOf(SpeechInput);
  });

  it('returns nothing when no speech input exists', () => {
    expect(
      createVoiceInput(
        { openAiTranscription: undefined, canRecord: false, recognitionFactory: undefined },
        handlers(),
      ),
    ).toBeUndefined();
  });

  it('explains how to enable OpenAI transcription when the browser service is unreachable', () => {
    const received = handlers();
    let onerror: RecognitionLike['onerror'] = null;
    const fake = {
      start: vi.fn(),
      set onerror(handler: RecognitionLike['onerror']) {
        onerror = handler;
      },
    } as unknown as RecognitionLike;
    const input = createVoiceInput(
      { openAiTranscription: undefined, canRecord: false, recognitionFactory: () => fake },
      received,
    )!;
    void input.start();
    onerror!({ error: 'network' });
    expect(received.onError).toHaveBeenCalledWith(expect.stringContaining('OPENAI_API_KEY'));
    expect(received.onError).not.toHaveBeenCalledWith(NETWORK_ERROR_MESSAGE);
  });
});
