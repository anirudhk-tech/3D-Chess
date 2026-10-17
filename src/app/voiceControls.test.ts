import { describe, expect, it, vi } from 'vitest';
import type { VoiceInput } from '../voice/types';
import { createVoiceControls } from './voiceControls';

function fakeVoice(listening = false) {
  const voice = {
    isListening: listening,
    start: vi.fn(),
    stop: vi.fn(),
    toggle: vi.fn(),
    dispose: vi.fn(),
  };
  return voice satisfies VoiceInput;
}

describe('voice controls', () => {
  it('starts listening on press only when the player may speak', () => {
    const voice = fakeVoice();
    const controls = createVoiceControls(voice, () => false);
    controls.press();
    expect(voice.start).not.toHaveBeenCalled();
    createVoiceControls(voice, () => true).press();
    expect(voice.start).toHaveBeenCalledTimes(1);
  });

  it('does not restart while already listening', () => {
    const voice = fakeVoice(true);
    createVoiceControls(voice, () => true).press();
    expect(voice.start).not.toHaveBeenCalled();
  });

  it('always allows stopping, even when speaking is no longer permitted', () => {
    const voice = fakeVoice(true);
    const controls = createVoiceControls(voice, () => false);
    controls.toggle();
    expect(voice.stop).toHaveBeenCalledTimes(1);
    controls.release();
    expect(voice.stop).toHaveBeenCalledTimes(2);
  });

  it('toggle starts when idle and permitted', () => {
    const voice = fakeVoice();
    createVoiceControls(voice, () => true).toggle();
    expect(voice.start).toHaveBeenCalledTimes(1);
  });
});
