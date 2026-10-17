export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

interface Tween {
  duration: number;
  elapsed: number;
  onUpdate: (t: number) => void;
  resolve: () => void;
}

export class Tweens {
  private active: Tween[] = [];
  private finished: Tween[] = [];

  get count() {
    return this.active.length;
  }

  run(duration: number, onUpdate: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      this.active.push({ duration, elapsed: 0, onUpdate, resolve });
    });
  }

  wait(seconds: number): Promise<void> {
    return this.run(seconds, () => undefined);
  }

  update(dt: number) {
    let kept = 0;
    for (const tween of this.active) {
      tween.elapsed += dt;
      const t = tween.duration > 0 ? Math.min(tween.elapsed / tween.duration, 1) : 1;
      tween.onUpdate(t);
      if (t >= 1) this.finished.push(tween);
      else this.active[kept++] = tween;
    }
    this.active.length = kept;
    for (const tween of this.finished) tween.resolve();
    this.finished.length = 0;
  }

  cancelAll() {
    const cancelled = this.active;
    this.active = [];
    for (const tween of cancelled) tween.resolve();
  }
}
