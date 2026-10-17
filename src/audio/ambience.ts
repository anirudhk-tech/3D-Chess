export interface BattleVoice {
  startBed(): void;
  distantClash(pan: number, volume: number): void;
  shout(pan: number, volume: number, pitch: number): void;
  drum(pan: number, volume: number): void;
  horn(pan: number, volume: number): void;
}

type Range = readonly [min: number, max: number];

const EVENT_GAP_MS: Range = [350, 2200];
const CLASH_VOLUME: Range = [0.15, 0.5];
const LOUD_CLASH_VOLUME: Range = [0.3, 0.6];
const DRUM_VOLUME: Range = [0.3, 0.6];
const HORN_VOLUME: Range = [0.15, 0.3];
const SHOUT_VOLUME: Range = [0.08, 0.2];
const SHOUT_PITCH_HZ: Range = [100, 220];
const SHOUT_STAGGER_MS: Range = [40, 180];
const SHOUT_PAN_SPREAD = 0.2;
const MIN_CROWD_SIZE = 2;
const CROWD_SIZE_VARIETY = 3;

const CLASH_THRESHOLD = 0.45;
const CROWD_THRESHOLD = 0.72;
const DRUM_THRESHOLD = 0.85;
const HORN_THRESHOLD = 0.9;

const between = ([min, max]: Range) => min + Math.random() * (max - min);
const randomPan = () => between([-1, 1]);
const clampPan = (pan: number) => Math.max(-1, Math.min(1, pan));

export class Ambience {
  private eventTimer?: ReturnType<typeof setTimeout>;
  private pendingShouts = new Set<ReturnType<typeof setTimeout>>();
  private running = false;

  constructor(private voice: BattleVoice) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.voice.startBed();
    this.scheduleNext();
  }

  stop() {
    this.running = false;
    clearTimeout(this.eventTimer);
    this.eventTimer = undefined;
    this.pendingShouts.forEach(clearTimeout);
    this.pendingShouts.clear();
  }

  private scheduleNext() {
    this.eventTimer = setTimeout(() => {
      this.fireRandomEvent();
      this.scheduleNext();
    }, between(EVENT_GAP_MS));
  }

  private fireRandomEvent() {
    const roll = Math.random();
    if (roll < CLASH_THRESHOLD) this.voice.distantClash(randomPan(), between(CLASH_VOLUME));
    else if (roll < CROWD_THRESHOLD) this.fireCrowd();
    else if (roll < DRUM_THRESHOLD) this.voice.drum(randomPan(), between(DRUM_VOLUME));
    else if (roll < HORN_THRESHOLD) this.voice.horn(randomPan(), between(HORN_VOLUME));
    else this.voice.distantClash(randomPan(), between(LOUD_CLASH_VOLUME));
  }

  private fireCrowd() {
    const size = MIN_CROWD_SIZE + Math.floor(Math.random() * CROWD_SIZE_VARIETY);
    const center = randomPan();
    for (let i = 0; i < size; i++) {
      const timer = setTimeout(
        () => {
          this.pendingShouts.delete(timer);
          const pan = clampPan(center + between([-SHOUT_PAN_SPREAD, SHOUT_PAN_SPREAD]));
          this.voice.shout(pan, between(SHOUT_VOLUME), between(SHOUT_PITCH_HZ));
        },
        i * between(SHOUT_STAGGER_MS),
      );
      this.pendingShouts.add(timer);
    }
  }
}
