import type { Vector3 } from 'three';

const MIN_SECONDS = 0.001;

export class CameraShake {
  private amplitude = 0;
  private seconds = 0;
  private remaining = 0;

  get strength(): number {
    if (this.remaining <= 0) return 0;
    return this.amplitude * (this.remaining / Math.max(this.seconds, MIN_SECONDS));
  }

  trigger(amplitude: number, seconds: number) {
    if (amplitude < this.strength) return;
    this.amplitude = amplitude;
    this.seconds = seconds;
    this.remaining = seconds;
  }

  advance(dt: number, out: Vector3): Vector3 {
    if (this.remaining <= 0) return out.set(0, 0, 0);
    this.remaining = Math.max(this.remaining - dt, 0);
    const strength = this.strength;
    return out.set(
      (Math.random() - 0.5) * strength,
      (Math.random() - 0.5) * strength,
      (Math.random() - 0.5) * strength,
    );
  }
}
