import { Vector3 } from 'three';
import { Ambience } from '../audio/ambience';
import { SoundBoard, type StepKind } from '../audio/sfx';
import type { PieceRig } from './models';
import { COLORS, ParticleSystem } from './effects';

type ShakeFn = (amplitude: number, seconds: number) => void;

const STEP_KIND: Record<string, StepKind> = {
  p: 'boot',
  k: 'boot',
  n: 'hoof',
  r: 'heavy',
  b: 'cloth',
  q: 'cloth',
};

class Fx {
  readonly sound = new SoundBoard();
  private ambience = new Ambience(this.sound);
  private particles?: ParticleSystem;
  private shake: ShakeFn = () => {};

  attach(particles: ParticleSystem, shake: ShakeFn) {
    this.particles = particles;
    this.shake = shake;
  }

  unlock() {
    this.sound.unlock();
    this.ambience.start();
  }

  setMuted(muted: boolean) {
    this.sound.setMuted(muted);
  }

  private dust(position: Vector3, count: number, size = 0.1, speed = 0.6) {
    this.particles?.emit({
      position: new Vector3(position.x, 0.05, position.z),
      count,
      color: COLORS.dust,
      speed,
      up: 0.8,
      size,
      life: 0.6,
      gravity: 2,
    });
  }

  footstep(rig: PieceRig) {
    const kind = STEP_KIND[rig.type] ?? 'boot';
    this.sound.footstep(kind);
    if (kind === 'heavy') {
      this.dust(rig.root.position, 6, 0.14, 0.9);
      this.shake(0.012, 0.15);
    } else if (kind !== 'cloth') {
      this.dust(rig.root.position, 2, 0.07, 0.4);
    }
  }

  swing() {
    this.sound.whoosh();
  }

  whinny() {
    this.sound.whinny();
  }

  hit(attacker: PieceRig, victimPosition: Vector3) {
    const point = new Vector3(victimPosition.x, 0.7, victimPosition.z);
    if (attacker.type === 'r') {
      this.sound.ramSlam();
      this.particles?.shockwave(victimPosition, COLORS.dust, 2.2);
      this.dust(victimPosition, 16, 0.14, 1.6);
      this.shake(0.14, 0.45);
    } else {
      this.sound.clash();
      this.particles?.emit({
        position: point,
        count: 16,
        color: COLORS.spark,
        speed: 2.2,
        up: 2.5,
        size: 0.04,
        life: 0.5,
        gravity: 9,
      });
      this.shake(0.05, 0.25);
    }
    this.sound.grunt();
  }

  fall(position: Vector3) {
    this.sound.thud();
    this.dust(position, 12, 0.12, 1);
    this.shake(0.03, 0.2);
  }

  sink(position: Vector3) {
    this.sound.sink();
    this.dust(position, 10, 0.1, 0.5);
  }

  check() {
    this.sound.check();
    this.shake(0.02, 0.3);
  }

  checkmate() {
    this.sound.checkmate();
    this.shake(0.1, 1.2);
  }

  promotion(position: Vector3) {
    this.sound.promotion();
    this.particles?.emit({
      position: new Vector3(position.x, 0.4, position.z),
      count: 24,
      color: COLORS.gold,
      speed: 1.2,
      up: 3,
      size: 0.05,
      life: 0.9,
      gravity: 3,
    });
  }
}

export const fx = new Fx();
