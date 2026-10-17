export interface KeyActions {
  toggleView(): void;
  startListening(): void;
  stopListening(): void;
}

export interface KeyLike {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

const INTERACTIVE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

export function isInteractiveTarget(target: EventTarget | null): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  return (
    !!element && (INTERACTIVE_TAGS.has(element.tagName ?? '') || element.isContentEditable === true)
  );
}

const hasModifier = (event: KeyLike) => event.ctrlKey || event.metaKey || event.altKey;

export function createKeyHandlers(actions: KeyActions) {
  let talking = false;

  const release = () => {
    if (!talking) return;
    talking = false;
    actions.stopListening();
  };

  return {
    keydown(event: KeyLike) {
      if (event.repeat || hasModifier(event) || isInteractiveTarget(event.target)) return;
      if (event.code === 'KeyV') {
        actions.toggleView();
      } else if (event.code === 'Space') {
        event.preventDefault();
        talking = true;
        actions.startListening();
      }
    },
    keyup(event: Pick<KeyLike, 'code'>) {
      if (event.code === 'Space') release();
    },
    blur: release,
  };
}

export function bindKeys(actions: KeyActions): () => void {
  const handlers = createKeyHandlers(actions);
  const onKeyDown = (event: KeyboardEvent) => { handlers.keydown(event); };
  const onKeyUp = (event: KeyboardEvent) => { handlers.keyup(event); };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', handlers.blur);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', handlers.blur);
  };
}
