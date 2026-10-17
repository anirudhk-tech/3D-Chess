import type { Vector3 } from 'three';
import { fx } from './fx';
import { resetToRest, restAngle, type PieceRig, type SiegeRig } from './models';
import type { Tweens } from './tween';
import { easeInOut, lerp } from './tween';

const WALK_SPEED = 2.2;
const SIEGE_SPEED_FACTOR = 0.65;
const GAIT_RATE = 11;
const MIN_WALK_SECONDS = 0.35;
const GAIT_RAMP = 6;
const FOOTSTEP_MIN_ENVELOPE = 0.3;
const ARRIVAL_EPSILON = 0.01;
const TURN_SECONDS = 0.25;

const STRIKE = {
  seconds: 0.7,
  windupEnd: 0.45,
  swingSeconds: 0.15,
  hitAt: 0.6,
  armRaised: -2.7,
  armStruck: -0.9,
  leanBack: -0.15,
  leanForward: 0.3,
};

const RAM = {
  seconds: 0.9,
  pullbackEnd: 0.55,
  slamSpan: 0.1,
  recoverStart: 0.7,
  hitAt: 0.65,
  pullback: 0.3,
  drive: 0.25,
  leanBack: -0.04,
  leanForward: 0.06,
};

const DEATH = {
  seconds: 0.7,
  fallAngle: (Math.PI / 2) * 0.98,
  armFlail: 1.2,
  rookShake: 0.05,
  rookShakeRate: 24,
};

const SINK = { seconds: 0.7, depth: 1.4 };

export function yawToward(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function shortestDelta(from: number, to: number): number {
  const turn = Math.PI * 2;
  return ((((to - from + Math.PI) % turn) + turn) % turn) - Math.PI;
}

export function turnTo(
  tweens: Tweens,
  rig: PieceRig,
  yaw: number,
  seconds = TURN_SECONDS,
): Promise<void> {
  const start = rig.facing.rotation.y;
  const delta = shortestDelta(start, yaw);
  if (Math.abs(delta) < ARRIVAL_EPSILON) return Promise.resolve();
  return tweens.run(seconds, (t) => {
    rig.facing.rotation.y = start + delta * easeInOut(t);
  });
}

function applyGait(rig: PieceRig, phase: number, amplitude: number) {
  const swing = Math.sin(phase) * amplitude;
  const bob = Math.abs(Math.sin(phase)) * amplitude;

  switch (rig.type) {
    case 'r':
      for (const wheel of rig.wheels) wheel.rotation.x = phase * 0.5;
      rig.tower.rotation.z = Math.sin(phase * 0.5) * 0.04 * amplitude;
      rig.figure.rotation.z = Math.sin(phase * 2) * 0.012 * amplitude;
      rig.figure.position.y = Math.abs(Math.sin(phase * 2)) * 0.02 * amplitude;
      return;
    case 'n':
      rig.legs.forEach((leg, index) => {
        const direction = index === 0 || index === 3 ? 1 : -1;
        leg.rotation.x = restAngle(rig, leg, 'x') + direction * swing * 0.8;
      });
      rig.figure.position.y = bob * 0.06;
      return;
    case 'p':
    case 'b':
    case 'q':
    case 'k': {
      const [left, right] = rig.legs;
      if (left && right) {
        left.rotation.x = restAngle(rig, left, 'x') + swing * 0.7;
        right.rotation.x = restAngle(rig, right, 'x') - swing * 0.7;
        rig.armL.rotation.x = restAngle(rig, rig.armL, 'x') - swing * 0.5;
        rig.armR.rotation.x = restAngle(rig, rig.armR, 'x') + swing * 0.15;
        rig.figure.position.y = bob * 0.04;
      } else {
        rig.figure.rotation.z = swing * 0.06;
        rig.figure.position.y = bob * 0.03;
      }
    }
  }
}

export function walk(tweens: Tweens, rig: PieceRig, to: Vector3, hop = 0): Promise<void> {
  const start = rig.root.position.clone();
  const distance = start.distanceTo(to);
  if (distance < ARRIVAL_EPSILON) return Promise.resolve();
  const speed = rig.type === 'r' ? WALK_SPEED * SIEGE_SPEED_FACTOR : WALK_SPEED;
  const seconds = Math.max(distance / speed, MIN_WALK_SECONDS);
  let lastStep = -1;
  return tweens
    .run(seconds, (t) => {
      rig.root.position.lerpVectors(start, to, easeInOut(t));
      rig.root.position.y = Math.sin(Math.PI * t) * hop;
      const envelope = Math.min(t * GAIT_RAMP, 1) * Math.min((1 - t) * GAIT_RAMP, 1);
      const phase = t * seconds * GAIT_RATE;
      applyGait(rig, phase, envelope);
      const step = Math.floor(phase / Math.PI);
      if (step !== lastStep && envelope > FOOTSTEP_MIN_ENVELOPE) fx.footstep(rig);
      lastStep = step;
    })
    .then(() => {
      rig.root.position.y = 0;
      resetToRest(rig);
    });
}

function slamRam(tweens: Tweens, rig: SiegeRig, onHit: () => void): Promise<void> {
  const restZ = rig.rest.get(rig.ram)?.position.z ?? rig.ram.position.z;
  let hit = false;
  return tweens
    .run(RAM.seconds, (t) => {
      const pullback = Math.min(t / RAM.pullbackEnd, 1);
      const slam = t < RAM.pullbackEnd ? 0 : Math.min((t - RAM.pullbackEnd) / RAM.slamSpan, 1);
      const recover = t < RAM.recoverStart ? 0 : (t - RAM.recoverStart) / (1 - RAM.recoverStart);
      const drawn = lerp(restZ, restZ - RAM.pullback, easeInOut(pullback));
      const driven = lerp(drawn, restZ + RAM.drive, slam);
      rig.ram.position.z = lerp(driven, restZ, easeInOut(recover));
      const lean = lerp(lerp(0, RAM.leanBack, pullback), RAM.leanForward, slam);
      rig.figure.rotation.x = lerp(lean, 0, easeInOut(recover));
      if (!hit && t >= RAM.hitAt) {
        hit = true;
        onHit();
      }
    })
    .then(() => {
      resetToRest(rig);
    });
}

export function strike(tweens: Tweens, rig: PieceRig, onHit: () => void): Promise<void> {
  if (rig.type === 'r') return slamRam(tweens, rig, onHit);
  const arm = rig.armR;
  const restArm = restAngle(rig, arm, 'x');
  const swingEnd = STRIKE.windupEnd + STRIKE.swingSeconds;
  let hit = false;
  let swung = false;
  return tweens
    .run(STRIKE.seconds, (t) => {
      const windup = Math.min(t / STRIKE.windupEnd, 1);
      const swing =
        t < STRIKE.windupEnd
          ? 0
          : Math.min((t - STRIKE.windupEnd) / (swingEnd - STRIKE.windupEnd), 1);
      const recover = t < STRIKE.hitAt ? 0 : (t - STRIKE.hitAt) / (1 - STRIKE.hitAt);
      const raised = lerp(restArm, STRIKE.armRaised, easeInOut(windup));
      const struck = lerp(raised, STRIKE.armStruck, swing);
      arm.rotation.x = lerp(struck, restArm, easeInOut(recover));
      const lean = lerp(lerp(0, STRIKE.leanBack, windup), STRIKE.leanForward, swing);
      rig.figure.rotation.x = lerp(lean, 0, easeInOut(recover));
      if (!swung && t >= STRIKE.windupEnd) {
        swung = true;
        fx.swing();
      }
      if (!hit && t >= STRIKE.hitAt) {
        hit = true;
        onHit();
      }
    })
    .then(() => {
      resetToRest(rig);
    });
}

function poseFalling(rig: PieceRig, t: number) {
  const fall = t * t * DEATH.fallAngle;
  if (rig.type === 'r') {
    rig.figure.rotation.z = fall;
    rig.figure.rotation.x = Math.sin(t * DEATH.rookShakeRate) * DEATH.rookShake * (1 - t);
    return;
  }
  if (rig.type === 'n') {
    rig.figure.rotation.z = fall;
    rig.figure.rotation.x = 0;
  } else {
    rig.figure.rotation.x = -fall;
  }
  const flail = Math.sin(t * Math.PI) * DEATH.armFlail;
  rig.armL.rotation.x = restAngle(rig, rig.armL, 'x') - flail;
  rig.armR.rotation.x = restAngle(rig, rig.armR, 'x') - flail;
}

export function die(tweens: Tweens, rig: PieceRig, knockback: Vector3): Promise<void> {
  const start = rig.root.position.clone();
  return tweens
    .run(DEATH.seconds, (t) => {
      rig.root.position.copy(start).addScaledVector(knockback, easeInOut(t));
      poseFalling(rig, t);
    })
    .then(() => {
      fx.fall(rig.root.position);
    });
}

export function sink(tweens: Tweens, rig: PieceRig): Promise<void> {
  const startY = rig.root.position.y;
  fx.sink(rig.root.position);
  return tweens.run(SINK.seconds, (t) => {
    rig.root.position.y = startY - easeInOut(t) * SINK.depth;
  });
}
