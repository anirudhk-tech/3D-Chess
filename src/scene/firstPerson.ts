import type { PerspectiveCamera } from 'three';

export const EYE_HEIGHT = 1;
export const WALK_SPEED = 2;
export const RUN_SPEED = 4.6;
export const ARENA_LIMIT = 11;
export const PLAYER_RADIUS = 0.25;

const TURN_SPEED = 1.8;
const LOOK_SENSITIVITY = 0.004;
const MAX_PITCH = 1.2;
const STRIDE_LENGTH = 0.8;
const BASE_FOV = 70;
const RUN_FOV = 78;
const SPAWN = { x: 0, z: 6.2 };

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export interface Point {
  x: number;
  z: number;
}

export function resolveCollisions(position: Point, obstacles: Obstacle[], playerRadius = PLAYER_RADIUS): Point {
  let { x, z } = position;
  for (let pass = 0; pass < 2; pass++) {
    for (const obstacle of obstacles) {
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      const minimum = obstacle.radius + playerRadius;
      if (distance >= minimum) continue;
      if (distance < 1e-6) {
        x = obstacle.x + minimum;
        continue;
      }
      x = obstacle.x + (dx / distance) * minimum;
      z = obstacle.z + (dz / distance) * minimum;
    }
  }
  x = Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, x));
  z = Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, z));
  return { x, z };
}

const HANDLED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class FirstPersonController {
  enabled = false;
  x = SPAWN.x;
  z = SPAWN.z;
  yaw = 0;
  pitch = -0.05;

  private keys = new Set<string>();
  private speed = 0;
  private phase = 0;
  private lastStep = 0;
  private dragging = false;

  constructor(
    private camera: PerspectiveCamera,
    element: EventTarget,
    private getObstacles: () => Obstacle[],
    private onStep: (running: boolean) => void,
    events: EventTarget = window,
  ) {
    const isSelect = (target: EventTarget | null) => typeof HTMLSelectElement !== 'undefined' && target instanceof HTMLSelectElement;

    events.addEventListener('keydown', (raw) => {
      const event = raw as KeyboardEvent;
      if (!this.enabled || isSelect(event.target)) return;
      if (HANDLED_KEYS.has(event.code)) {
        this.keys.add(event.code);
        event.preventDefault();
      } else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        this.keys.add('Shift');
      }
    });
    events.addEventListener('keyup', (raw) => {
      const event = raw as KeyboardEvent;
      this.keys.delete(event.code);
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.keys.delete('Shift');
    });
    events.addEventListener('blur', () => this.keys.clear());

    element.addEventListener('pointerdown', () => {
      this.dragging = this.enabled;
    });
    events.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    events.addEventListener('pointermove', (raw) => {
      const event = raw as PointerEvent;
      if (!this.dragging || !this.enabled) return;
      this.yaw -= event.movementX * LOOK_SENSITIVITY;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - event.movementY * LOOK_SENSITIVITY));
    });
  }

  activate() {
    this.enabled = true;
    this.camera.rotation.order = 'YXZ';
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();
  }

  deactivate() {
    this.enabled = false;
    this.keys.clear();
    this.speed = 0;
    this.camera.rotation.order = 'XYZ';
    this.camera.fov = 45;
    this.camera.updateProjectionMatrix();
  }

  get running() {
    return this.keys.has('Shift') && Math.abs(this.speed) > 0.2;
  }

  update(dt: number) {
    if (!this.enabled) return;
    const turn = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    this.yaw += turn * TURN_SPEED * dt;

    const forward = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    const topSpeed = this.keys.has('Shift') ? RUN_SPEED : WALK_SPEED;
    const backwardPenalty = forward < 0 ? 0.6 : 1;
    const target = forward * topSpeed * backwardPenalty;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);
    if (Math.abs(this.speed) < 0.01) this.speed = 0;

    const next = resolveCollisions(
      {
        x: this.x - Math.sin(this.yaw) * this.speed * dt,
        z: this.z - Math.cos(this.yaw) * this.speed * dt,
      },
      this.getObstacles(),
    );
    this.x = next.x;
    this.z = next.z;

    const pace = Math.abs(this.speed);
    this.phase += (pace * dt * Math.PI) / STRIDE_LENGTH;
    const step = Math.floor(this.phase / Math.PI);
    if (step !== this.lastStep) {
      this.lastStep = step;
      if (pace > 0.3) this.onStep(this.running);
    }

    const intensity = Math.min(pace / WALK_SPEED, 2.3);
    const bob = (Math.abs(Math.sin(this.phase)) - 0.5) * 0.03 * intensity;
    const sway = Math.sin(this.phase) * 0.012 * intensity;
    const roll = Math.sin(this.phase) * 0.006 * intensity;
    const idle = pace < 0.05 ? Math.sin(performance.now() / 800) * 0.004 : 0;

    this.camera.position.set(
      this.x + Math.cos(this.yaw) * sway,
      EYE_HEIGHT + bob + idle,
      this.z - Math.sin(this.yaw) * sway,
    );
    this.camera.rotation.set(this.pitch, this.yaw, roll);

    const targetFov = this.running ? RUN_FOV : BASE_FOV;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
  }
}
