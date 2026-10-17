import type { Object3D } from 'three';
import type { PieceRig } from './models';
import { easeInOut } from './tween';

type Axis = 'x' | 'y' | 'z';
type Clip = { duration: number; apply: (rig: PieceRig, p: number, e: number) => void };

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function envelope(p: number): number {
  return easeInOut(Math.min(p / 0.15, 1) * Math.min((1 - p) / 0.15, 1));
}

function blend(rig: PieceRig, node: Object3D | undefined, axis: Axis, target: number, e: number) {
  if (!node) return;
  const rest = rig.rest.get(node);
  if (!rest) return;
  node.rotation[axis] = lerp(rest.rotation[axis], target, e);
}

function offset(rig: PieceRig, node: Object3D | undefined, axis: Axis, delta: number) {
  if (!node) return;
  const rest = rig.rest.get(node);
  if (!rest) return;
  node.rotation[axis] = rest.rotation[axis] + delta;
}

const polish: Clip = {
  duration: 4,
  apply(rig, p, e) {
    const rub = Math.sin(p * TAU * 5);
    blend(rig, rig.armL, 'x', -1.25 + rub * 0.1, e);
    blend(rig, rig.armR, 'x', -0.6, e);
    if (rig.head) offset(rig, rig.head, 'x', 0.3 * e);
    rig.figure.rotation.x = 0.12 * e;
  },
};

const practice: Clip = {
  duration: 3.2,
  apply(rig, p, e) {
    const cycle = (p * 2) % 1;
    let angle: number;
    if (cycle < 0.55) angle = lerp(0, -2.6, easeInOut(cycle / 0.55));
    else if (cycle < 0.7) angle = lerp(-2.6, -0.8, (cycle - 0.55) / 0.15);
    else angle = lerp(-0.8, 0, easeInOut((cycle - 0.7) / 0.3));
    if (rig.armR) offset(rig, rig.armR, 'x', angle * e);
    rig.figure.rotation.y = Math.sin(cycle * TAU) * 0.15 * e;
    rig.figure.rotation.x = (cycle > 0.55 && cycle < 0.8 ? 0.15 : 0) * e;
  },
};

const look: Clip = {
  duration: 3,
  apply(rig, p, e) {
    offset(rig, rig.head, 'y', Math.sin(p * TAU) * 0.7 * e);
    offset(rig, rig.horseHead, 'y', Math.sin(p * TAU) * 0.35 * e);
  },
};

const stretch: Clip = {
  duration: 2.6,
  apply(rig, p, e) {
    blend(rig, rig.armL, 'x', -3.0, e);
    blend(rig, rig.armR, 'x', -3.0, e);
    rig.figure.rotation.x = -0.15 * e;
  },
};

const bless: Clip = {
  duration: 3.6,
  apply(rig, p, e) {
    blend(rig, rig.armL, 'x', -1.5, e);
    blend(rig, rig.armL, 'z', Math.sin(p * TAU * 2) * 0.35, e);
    offset(rig, rig.head, 'y', Math.sin(p * TAU) * 0.25 * e);
  },
};

const wave: Clip = {
  duration: 3,
  apply(rig, p, e) {
    blend(rig, rig.armL, 'x', -2.7, e);
    blend(rig, rig.armL, 'z', Math.sin(p * TAU * 4) * 0.4, e);
    offset(rig, rig.head, 'z', 0.15 * e);
  },
};

const tap: Clip = {
  duration: 2.6,
  apply(rig, p, e) {
    offset(rig, rig.armR, 'x', Math.sin(p * TAU * 4) * 0.14 * e);
    offset(rig, rig.head, 'y', Math.sin(p * TAU) * 0.2 * e);
  },
};

const paw: Clip = {
  duration: 3,
  apply(rig, p, e) {
    const front = rig.legs[1];
    offset(rig, front, 'x', (-0.2 + Math.sin(p * TAU * 3) * 0.6) * e);
    offset(rig, rig.neck, 'x', Math.sin(p * TAU * 3) * 0.1 * e);
  },
};

const headToss: Clip = {
  duration: 2.6,
  apply(rig, p, e) {
    const toss = Math.sin(p * TAU * 2) * e;
    offset(rig, rig.neck, 'x', -0.4 * toss);
    offset(rig, rig.horseHead, 'x', -0.35 * toss);
  },
};

const swish: Clip = {
  duration: 3,
  apply(rig, p, e) {
    const swing = Math.sin(p * TAU * 4) * e;
    offset(rig, rig.tail, 'z', swing * 0.5);
    if (rig.tail) rig.tail.position.x = (rig.rest.get(rig.tail)?.position.x ?? 0) + swing * 0.08;
  },
};

const sway: Clip = {
  duration: 3,
  apply(rig, p, e) {
    rig.figure.rotation.z = Math.sin(p * TAU) * 0.03 * e;
  },
};

const CLIPS: Record<string, Clip[]> = {
  p: [polish, practice, look, stretch],
  k: [practice, look, stretch, polish],
  b: [bless, look, stretch],
  q: [wave, look, tap],
  n: [paw, headToss, swish, look],
};

interface IdleState {
  clip?: Clip;
  elapsed: number;
  cooldown: number;
  breathPhase: number;
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

export function resetToRest(rig: PieceRig) {
  for (const [node, rest] of rig.rest) {
    node.rotation.copy(rest.rotation);
    node.position.copy(rest.position);
  }
  rig.figure.rotation.set(0, 0, 0);
  rig.figure.position.set(0, 0, 0);
  rig.facing.scale.y = 1;
}

export class IdleAnimator {
  private states = new WeakMap<PieceRig, IdleState>();

  private stateOf(rig: PieceRig): IdleState {
    let state = this.states.get(rig);
    if (!state) {
      state = { elapsed: 0, cooldown: randomBetween(1, 6), breathPhase: randomBetween(0, TAU) };
      this.states.set(rig, state);
    }
    return state;
  }

  release(rig: PieceRig) {
    const state = this.stateOf(rig);
    if (state.clip) resetToRest(rig);
    state.clip = undefined;
    state.elapsed = 0;
    state.cooldown = randomBetween(2, 6);
    rig.facing.scale.y = 1;
  }

  update(dt: number, rigs: Iterable<PieceRig>) {
    for (const rig of rigs) {
      if (rig.busy) continue;
      const state = this.stateOf(rig);
      state.breathPhase += dt * 1.6;
      rig.facing.scale.y = 1 + Math.sin(state.breathPhase) * 0.012;

      if (!state.clip) {
        state.cooldown -= dt;
        if (state.cooldown > 0) continue;
        const choices = CLIPS[rig.type] ?? [sway];
        state.clip = choices[Math.floor(Math.random() * choices.length)]!;
        state.elapsed = 0;
      }

      state.elapsed += dt;
      const p = Math.min(state.elapsed / state.clip.duration, 1);
      state.clip.apply(rig, p, envelope(p));
      if (p >= 1) {
        resetToRest(rig);
        state.clip = undefined;
        state.cooldown = randomBetween(3, 9);
      }
    }
  }
}
