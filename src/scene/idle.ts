import type { Object3D } from 'three';
import { resetToRest, restAngle, type HumanoidRig, type KnightRig, type PieceRig } from './models';
import { easeInOut, lerp } from './tween';

type Axis = 'x' | 'y' | 'z';

interface Clip<R extends PieceRig> {
  duration: number;
  apply: (rig: R, progress: number, strength: number) => void;
}

interface ActiveClip {
  duration: number;
  apply: (progress: number, strength: number) => void;
}

interface IdleState {
  clip?: ActiveClip;
  elapsed: number;
  cooldown: number;
  breathPhase: number;
}

const TAU = Math.PI * 2;
const FADE_FRACTION = 0.15;
const BREATH_RATE = 1.6;
const BREATH_DEPTH = 0.012;
const FIRST_COOLDOWN = { min: 1, max: 6 };
const RELEASE_COOLDOWN = { min: 2, max: 6 };
const BETWEEN_CLIPS_COOLDOWN = { min: 3, max: 9 };

const randomBetween = ({ min, max }: { min: number; max: number }) =>
  min + Math.random() * (max - min);

function envelope(progress: number): number {
  return easeInOut(
    Math.min(progress / FADE_FRACTION, 1) * Math.min((1 - progress) / FADE_FRACTION, 1),
  );
}

function blend(rig: PieceRig, node: Object3D, axis: Axis, target: number, strength: number) {
  node.rotation[axis] = lerp(restAngle(rig, node, axis), target, strength);
}

function offset(rig: PieceRig, node: Object3D, axis: Axis, delta: number) {
  node.rotation[axis] = restAngle(rig, node, axis) + delta;
}

const polish: Clip<HumanoidRig> = {
  duration: 4,
  apply(rig, p, e) {
    blend(rig, rig.armL, 'x', -1.25 + Math.sin(p * TAU * 5) * 0.1, e);
    blend(rig, rig.armR, 'x', -0.6, e);
    offset(rig, rig.head, 'x', 0.3 * e);
    rig.figure.rotation.x = 0.12 * e;
  },
};

const practice: Clip<HumanoidRig> = {
  duration: 3.2,
  apply(rig, p, e) {
    const cycle = (p * 2) % 1;
    let angle: number;
    if (cycle < 0.55) angle = lerp(0, -2.6, easeInOut(cycle / 0.55));
    else if (cycle < 0.7) angle = lerp(-2.6, -0.8, (cycle - 0.55) / 0.15);
    else angle = lerp(-0.8, 0, easeInOut((cycle - 0.7) / 0.3));
    offset(rig, rig.armR, 'x', angle * e);
    rig.figure.rotation.y = Math.sin(cycle * TAU) * 0.15 * e;
    rig.figure.rotation.x = (cycle > 0.55 && cycle < 0.8 ? 0.15 : 0) * e;
  },
};

const look: Clip<HumanoidRig | KnightRig> = {
  duration: 3,
  apply(rig, p, e) {
    const turn = Math.sin(p * TAU);
    offset(rig, rig.head, 'y', turn * 0.7 * e);
    if (rig.type === 'n') offset(rig, rig.horseHead, 'y', turn * 0.35 * e);
  },
};

const stretch: Clip<HumanoidRig> = {
  duration: 2.6,
  apply(rig, _p, e) {
    blend(rig, rig.armL, 'x', -3.0, e);
    blend(rig, rig.armR, 'x', -3.0, e);
    rig.figure.rotation.x = -0.15 * e;
  },
};

const bless: Clip<HumanoidRig> = {
  duration: 3.6,
  apply(rig, p, e) {
    blend(rig, rig.armL, 'x', -1.5, e);
    blend(rig, rig.armL, 'z', Math.sin(p * TAU * 2) * 0.35, e);
    offset(rig, rig.head, 'y', Math.sin(p * TAU) * 0.25 * e);
  },
};

const wave: Clip<HumanoidRig> = {
  duration: 3,
  apply(rig, p, e) {
    blend(rig, rig.armL, 'x', -2.7, e);
    blend(rig, rig.armL, 'z', Math.sin(p * TAU * 4) * 0.4, e);
    offset(rig, rig.head, 'z', 0.15 * e);
  },
};

const tap: Clip<HumanoidRig> = {
  duration: 2.6,
  apply(rig, p, e) {
    offset(rig, rig.armR, 'x', Math.sin(p * TAU * 4) * 0.14 * e);
    offset(rig, rig.head, 'y', Math.sin(p * TAU) * 0.2 * e);
  },
};

const paw: Clip<KnightRig> = {
  duration: 3,
  apply(rig, p, e) {
    const stamp = Math.sin(p * TAU * 3);
    offset(rig, rig.legs[1], 'x', (-0.2 + stamp * 0.6) * e);
    offset(rig, rig.neck, 'x', stamp * 0.1 * e);
  },
};

const headToss: Clip<KnightRig> = {
  duration: 2.6,
  apply(rig, p, e) {
    const toss = Math.sin(p * TAU * 2) * e;
    offset(rig, rig.neck, 'x', -0.4 * toss);
    offset(rig, rig.horseHead, 'x', -0.35 * toss);
  },
};

const swish: Clip<KnightRig> = {
  duration: 3,
  apply(rig, p, e) {
    const swing = Math.sin(p * TAU * 4) * e;
    offset(rig, rig.tail, 'z', swing * 0.5);
    rig.tail.position.x = (rig.rest.get(rig.tail)?.position.x ?? 0) + swing * 0.08;
  },
};

const sway: Clip<PieceRig> = {
  duration: 3,
  apply(rig, p, e) {
    rig.figure.rotation.z = Math.sin(p * TAU) * 0.03 * e;
  },
};

const HUMANOID_CLIPS: Record<
  HumanoidRig['type'],
  readonly [Clip<HumanoidRig>, ...Clip<HumanoidRig>[]]
> = {
  p: [polish, practice, look, stretch],
  k: [practice, look, stretch, polish],
  b: [bless, look, stretch],
  q: [wave, look, tap],
};

const KNIGHT_CLIPS: readonly [Clip<KnightRig>, ...Clip<KnightRig>[]] = [paw, headToss, swish, look];

function pickRandom<T>(items: readonly [T, ...T[]]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function bind<R extends PieceRig>(clip: Clip<R>, rig: R): ActiveClip {
  return {
    duration: clip.duration,
    apply: (progress, strength) => {
      clip.apply(rig, progress, strength);
    },
  };
}

export function chooseClip(rig: PieceRig): ActiveClip {
  switch (rig.type) {
    case 'r':
      return bind(sway, rig);
    case 'n':
      return bind(pickRandom(KNIGHT_CLIPS), rig);
    case 'p':
    case 'b':
    case 'q':
    case 'k':
      return bind(pickRandom(HUMANOID_CLIPS[rig.type]), rig);
  }
}

export class IdleAnimator {
  private states = new WeakMap<PieceRig, IdleState>();

  isPlaying(rig: PieceRig): boolean {
    return this.states.get(rig)?.clip !== undefined;
  }

  release(rig: PieceRig) {
    const state = this.stateOf(rig);
    if (state.clip) resetToRest(rig);
    state.clip = undefined;
    state.elapsed = 0;
    state.cooldown = randomBetween(RELEASE_COOLDOWN);
    rig.facing.scale.y = 1;
  }

  update(dt: number, rigs: Iterable<PieceRig>) {
    for (const rig of rigs) {
      if (!rig.busy) this.step(rig, dt);
    }
  }

  private stateOf(rig: PieceRig): IdleState {
    let state = this.states.get(rig);
    if (!state) {
      state = {
        elapsed: 0,
        cooldown: randomBetween(FIRST_COOLDOWN),
        breathPhase: randomBetween({ min: 0, max: TAU }),
      };
      this.states.set(rig, state);
    }
    return state;
  }

  private step(rig: PieceRig, dt: number) {
    const state = this.stateOf(rig);
    state.breathPhase += dt * BREATH_RATE;
    rig.facing.scale.y = 1 + Math.sin(state.breathPhase) * BREATH_DEPTH;

    if (!state.clip) {
      state.cooldown -= dt;
      if (state.cooldown > 0) return;
      state.clip = chooseClip(rig);
      state.elapsed = 0;
    }

    state.elapsed += dt;
    const progress = Math.min(state.elapsed / state.clip.duration, 1);
    state.clip.apply(progress, envelope(progress));
    if (progress >= 1) {
      resetToRest(rig);
      state.clip = undefined;
      state.cooldown = randomBetween(BETWEEN_CLIPS_COOLDOWN);
    }
  }
}
