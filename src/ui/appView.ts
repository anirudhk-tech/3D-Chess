import type { Difficulty } from '../opponent/opponent';
import './styles.css';

const MIC_LABEL = 'Mic';
const LISTENING_LABEL = 'Listening...';
const MIC_TITLE = 'Click, or hold Space, and speak an order';
const HINT_TEXT =
  'Arrows walk and turn · Shift runs · drag to look · V toggles overview · Space or Mic to speak';
const INPUT_PLACEHOLDER = 'Give an order, e.g. send the horse out';

const LEVELS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
];
const DEFAULT_LEVEL: Difficulty = 'normal';

export interface AppViewHandlers {
  onSubmit(text: string): void;
  onMicClick(): void;
  onSoundClick(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

const hiddenLabel = (text: string, forId: string) =>
  element('label', { htmlFor: forId, className: 'visually-hidden', textContent: text });

export class AppView {
  readonly viewport: HTMLElement;
  private form: HTMLFormElement;
  private input: HTMLInputElement;
  private level: HTMLSelectElement;
  private mic: HTMLButtonElement;
  private sound: HTMLButtonElement;
  private status: HTMLElement;

  constructor(root: HTMLElement, handlers: AppViewHandlers) {
    this.viewport = element('div', { id: 'viewport' });
    this.viewport.setAttribute('aria-label', '3D chess board');

    this.input = element('input', {
      id: 'move',
      type: 'text',
      className: 'control',
      autocomplete: 'off',
      placeholder: INPUT_PLACEHOLDER,
    });
    this.level = element('select', { id: 'level', className: 'control' });
    for (const { value, label } of LEVELS) {
      this.level.append(
        element('option', { value, textContent: label, selected: value === DEFAULT_LEVEL }),
      );
    }
    this.mic = element('button', {
      id: 'mic',
      type: 'button',
      className: 'control',
      textContent: MIC_LABEL,
      title: MIC_TITLE,
    });
    this.sound = element('button', { id: 'sound', type: 'button', className: 'control' });
    this.setSoundOn(true);
    this.status = element('span', { id: 'status' });
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');

    this.form = element('form', { id: 'command' });
    this.form.append(
      hiddenLabel('Order', 'move'),
      this.input,
      hiddenLabel('Difficulty', 'level'),
      this.level,
      this.mic,
      this.sound,
      this.status,
    );
    root.replaceChildren(
      this.viewport,
      this.form,
      element('div', { id: 'hint', textContent: HINT_TEXT }),
    );

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      handlers.onSubmit(this.input.value);
    });
    this.mic.addEventListener('click', () => {
      this.mic.blur();
      handlers.onMicClick();
    });
    this.sound.addEventListener('click', handlers.onSoundClick);
    this.input.focus();
  }

  get difficulty(): Difficulty {
    return this.level.value as Difficulty;
  }

  setStatus(text: string) {
    this.status.textContent = text;
  }

  setInput(text: string) {
    this.input.value = text;
  }

  clearInput() {
    this.input.value = '';
  }

  setListening(listening: boolean) {
    this.mic.classList.toggle('listening', listening);
    this.mic.textContent = listening ? LISTENING_LABEL : MIC_LABEL;
  }

  setSoundOn(on: boolean) {
    this.sound.textContent = on ? 'Sound: on' : 'Sound: off';
  }

  setBusy(busy: boolean) {
    this.form.setAttribute('aria-busy', String(busy));
  }

  disableMic(reason: string) {
    this.mic.disabled = true;
    this.mic.title = reason;
    this.mic.setAttribute('aria-label', `${MIC_LABEL}: ${reason}`);
  }
}
