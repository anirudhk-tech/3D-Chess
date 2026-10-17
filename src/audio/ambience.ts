export interface BattleVoice {
  startBed(): void;
  distantClash(pan: number, volume: number): void;
  shout(pan: number, volume: number, pitch: number): void;
  drum(pan: number, volume: number): void;
  horn(pan: number, volume: number): void;
}

const MIN_GAP_MS = 350;
const MAX_GAP_MS = 2200;

const between = (min: number, max: number) => min + Math.random() * (max - min);
const randomPan = () => between(-1, 1);

export class Ambience {
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(private voice: BattleVoice) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.voice.startBed();
    this.schedule();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
  }

  private schedule() {
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.fire();
      this.schedule();
    }, between(MIN_GAP_MS, MAX_GAP_MS));
  }

  private fire() {
    const roll = Math.random();
    if (roll < 0.45) this.voice.distantClash(randomPan(), between(0.15, 0.5));
    else if (roll < 0.72) this.crowd();
    else if (roll < 0.85) this.voice.drum(randomPan(), between(0.3, 0.6));
    else if (roll < 0.9) this.voice.horn(randomPan(), between(0.15, 0.3));
    else this.voice.distantClash(randomPan(), between(0.3, 0.6));
  }

  private crowd() {
    const voices = 2 + Math.floor(Math.random() * 3);
    const pan = randomPan();
    for (let i = 0; i < voices; i++) {
      setTimeout(
        () => this.running && this.voice.shout(pan + between(-0.2, 0.2), between(0.08, 0.2), between(100, 220)),
        i * between(40, 180),
      );
    }
  }
}
