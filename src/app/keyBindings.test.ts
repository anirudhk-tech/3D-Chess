import { describe, expect, it, vi } from 'vitest';
import { createKeyHandlers, isInteractiveTarget, type KeyLike } from './keyBindings';

const key = (code: string, overrides: Partial<KeyLike> = {}): KeyLike => ({
  code,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: null,
  preventDefault: vi.fn(),
  ...overrides,
});

const element = (tagName: string, isContentEditable = false) =>
  ({ tagName, isContentEditable }) as unknown as EventTarget;

function setup() {
  const actions = { toggleView: vi.fn(), startListening: vi.fn(), stopListening: vi.fn() };
  return { actions, handlers: createKeyHandlers(actions) };
}

describe('key handlers', () => {
  it('toggles the view on V and ignores auto-repeat', () => {
    const { actions, handlers } = setup();
    handlers.keydown(key('KeyV'));
    handlers.keydown(key('KeyV', { repeat: true }));
    expect(actions.toggleView).toHaveBeenCalledTimes(1);
  });

  it.each(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'])(
    'ignores V and Space while focus is on %s',
    (tag) => {
      const { actions, handlers } = setup();
      const space = key('Space', { target: element(tag) });
      handlers.keydown(key('KeyV', { target: element(tag) }));
      handlers.keydown(space);
      expect(actions.toggleView).not.toHaveBeenCalled();
      expect(actions.startListening).not.toHaveBeenCalled();
      expect(space.preventDefault).not.toHaveBeenCalled();
    },
  );

  it('ignores shortcuts combined with modifiers', () => {
    const { actions, handlers } = setup();
    handlers.keydown(key('KeyV', { metaKey: true }));
    handlers.keydown(key('Space', { ctrlKey: true }));
    expect(actions.toggleView).not.toHaveBeenCalled();
    expect(actions.startListening).not.toHaveBeenCalled();
  });

  it('starts on Space down, stops on Space up, and prevents page scroll', () => {
    const { actions, handlers } = setup();
    const down = key('Space');
    handlers.keydown(down);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(actions.startListening).toHaveBeenCalledTimes(1);
    handlers.keyup({ code: 'Space' });
    expect(actions.stopListening).toHaveBeenCalledTimes(1);
  });

  it('does not start again for repeated Space events', () => {
    const { actions, handlers } = setup();
    handlers.keydown(key('Space'));
    handlers.keydown(key('Space', { repeat: true }));
    expect(actions.startListening).toHaveBeenCalledTimes(1);
  });

  it('releases when focus leaves the window while Space is held', () => {
    const { actions, handlers } = setup();
    handlers.keydown(key('Space'));
    handlers.blur();
    expect(actions.stopListening).toHaveBeenCalledTimes(1);
    handlers.keyup({ code: 'Space' });
    expect(actions.stopListening).toHaveBeenCalledTimes(1);
  });

  it('does not stop on Space up if the press was never ours', () => {
    const { actions, handlers } = setup();
    handlers.keydown(key('Space', { target: element('INPUT') }));
    handlers.keyup({ code: 'Space' });
    expect(actions.stopListening).not.toHaveBeenCalled();
  });
});

describe('isInteractiveTarget', () => {
  it('recognises editable content and rejects plain elements', () => {
    expect(isInteractiveTarget(element('DIV', true))).toBe(true);
    expect(isInteractiveTarget(element('CANVAS'))).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });
});
