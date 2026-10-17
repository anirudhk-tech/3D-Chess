import { Vector3 } from 'three';
import type { PieceRig } from './models';
import { Tweens, easeInOut } from './tween';

const WALK_SPEED = 2.2;
const GAIT_RATE = 11;
const MIN_WALK_SECONDS = 0.35;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const restOf = (group: { userData: Record<string, number> }) => group.userData.restX ?? 0;

export function yawToward(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function shortestDelta(from: number, to: number): number {
  return ((((to - from + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

export function turnTo(tweens: Tweens, rig: PieceRig, yaw: number, seconds = 0.25): Promise<void> {
  const start = rig.facing.rotation.y;
  const delta = shortestDelta(start, yaw);
  if (Math.abs(delta) < 0.01) return Promise.resolve();
  return tweens.run(seconds, (t) => {
    rig.facing.rotation.y = start + delta * easeInOut(t);
  });
}

function applyGait(rig: PieceRig, phase: number, amplitude: number) {
  const swing = Math.sin(phase) * amplitude;
  const bob = Math.abs(Math.sin(phase)) * amplitude;

  if (rig.type === 'n') {
    rig.legs.forEach((leg, index) => {
      const direction = index === 0 || index === 3 ? 1 : -1;
      leg.rotation.x = restOf(leg) + direction * swing * 0.8;
    });
    rig.figure.position.y = bob * 0.06;
    return;
  }

  if (rig.legs.length === 2) {
    rig.legs[0]!.rotation.x = restOf(rig.legs[0]!) + swing * 0.7;
    rig.legs[1]!.rotation.x = restOf(rig.legs[1]!) - swing * 0.7;
    if (rig.armL) rig.armL.rotation.x = restOf(rig.armL) - swing * 0.5;
    if (rig.armR) rig.armR.rotation.x = restOf(rig.armR) + swing * 0.15;
    rig.figure.position.y = bob * 0.04;
    return;
  }

  rig.figure.rotation.z = swing * 0.06;
  rig.figure.position.y = bob * 0.03;
}

function resetPose(rig: PieceRig) {
  for (const leg of rig.legs) leg.rotation.x = restOf(leg);
  if (rig.armL) rig.armL.rotation.x = restOf(rig.armL);
  if (rig.armR) rig.armR.rotation.x = restOf(rig.armR);
  rig.figure.position.y = 0;
  rig.figure.rotation.set(0, 0, 0);
}

export function walk(tweens: Tweens, rig: PieceRig, to: Vector3, hop = 0): Promise<void> {
  const start = rig.root.position.clone();
  const distance = start.distanceTo(to);
  if (distance < 0.01) return Promise.resolve();
  const seconds = Math.max(distance / WALK_SPEED, MIN_WALK_SECONDS);
  return tweens
    .run(seconds, (t) => {
      rig.root.position.lerpVectors(start, to, easeInOut(t));
      rig.root.position.y = Math.sin(Math.PI * t) * hop;
      const envelope = Math.min(t * 6, 1) * Math.min((1 - t) * 6, 1);
      applyGait(rig, t * seconds * GAIT_RATE, envelope);
    })
    .then(() => {
      rig.root.position.y = 0;
      resetPose(rig);
    });
}

export function strike(tweens: Tweens, rig: PieceRig, onHit: () => void): Promise<void> {
  const arm = rig.armR;
  let hit = false;
  const restArm = arm ? restOf(arm) : 0;
  return tweens
    .run(0.7, (t) => {
      const windup = Math.min(t / 0.45, 1);
      const swing = t < 0.45 ? 0 : Math.min((t - 0.45) / 0.15, 1);
      const recover = t < 0.6 ? 0 : (t - 0.6) / 0.4;
      if (arm) {
        const raised = lerp(restArm, -2.7, easeInOut(windup));
        const struck = lerp(raised, -0.9, swing);
        arm.rotation.x = lerp(struck, restArm, easeInOut(recover));
      }
      const lean = lerp(lerp(0, -0.15, windup), 0.3, swing);
      rig.figure.rotation.x = lerp(lean, 0, easeInOut(recover));
      if (!hit && t >= 0.6) {
        hit = true;
        onHit();
      }
    })
    .then(() => resetPose(rig));
}

export function die(tweens: Tweens, rig: PieceRig, knockback: Vector3): Promise<void> {
  const start = rig.root.position.clone();
  const sideways = rig.type === 'n';
  return tweens.run(0.7, (t) => {
    const fall = t * t;
    if (sideways) rig.figure.rotation.z = fall * (Math.PI / 2) * 0.98;
    else rig.figure.rotation.x = -fall * (Math.PI / 2) * 0.98;
    rig.root.position.copy(start).addScaledVector(knockback, easeInOut(t));
    if (rig.armL) rig.armL.rotation.x = restOf(rig.armL) - Math.sin(t * Math.PI) * 1.2;
    if (rig.armR) rig.armR.rotation.x = restOf(rig.armR) - Math.sin(t * Math.PI) * 1.2;
  });
}

export function sink(tweens: Tweens, rig: PieceRig): Promise<void> {
  const startY = rig.root.position.y;
  return tweens.run(0.7, (t) => {
    rig.root.position.y = startY - easeInOut(t) * 1.4;
  });
}
