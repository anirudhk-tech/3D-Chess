const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

export function bindAudioUnlock(unlock: () => void): () => void {
  for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlock, { passive: true });
  return () => {
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlock);
  };
}
