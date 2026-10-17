export interface Tween {
  duration: number;
  elapsed: number;
  onUpdate: (t: number) => void;
  resolve: () => void;
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Tweens {
  private active: Tween[] = [];

  run(duration: number, onUpdate: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      this.active.push({ duration, elapsed: 0, onUpdate, resolve });
    });
  }

  update(dt: number) {
    const finished: Tween[] = [];
    for (const tween of this.active) {
      tween.elapsed += dt;
      const t = Math.min(tween.elapsed / tween.duration, 1);
      tween.onUpdate(t);
      if (t >= 1) finished.push(tween);
    }
    if (finished.length === 0) return;
    this.active = this.active.filter((tween) => !finished.includes(tween));
    for (const tween of finished) tween.resolve();
  }
}
