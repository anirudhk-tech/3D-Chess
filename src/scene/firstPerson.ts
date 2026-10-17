import type { PerspectiveCamera } from 'three';

export const EYE_HEIGHT = 1;
export const WALK_SPEED = 2;
export const RUN_SPEED = 4.6;
export const ARENA_LIMIT = 11;
export const PLAYER_RADIUS = 0.25;

export const OVERVIEW_FOV = 45;

const TURN_SPEED = 1.8;
const LOOK_SENSITIVITY = 0.004;
const MAX_PITCH = 1.2;
const INITIAL_PITCH = -0.05;
const STRIDE_LENGTH = 0.8;
const BASE_FOV = 70;
const RUN_FOV = 78;
const FOV_EASING = 6;
const SPEED_EASING = 10;
const BACKWARD_SPEED_FACTOR = 0.6;
const STOP_SPEED = 0.01;
const RUNNING_SPEED = 0.2;
const FOOTSTEP_MIN_SPEED = 0.3;
const IDLE_SPEED = 0.05;
const MAX_BOB_INTENSITY = 2.3;
const BOB_AMPLITUDE = 0.03;
const SWAY_AMPLITUDE = 0.012;
const ROLL_AMPLITUDE = 0.006;
const BREATH_AMPLITUDE = 0.004;
const BREATH_PERIOD_MS = 800;
const COLLISION_PASSES = 2;
const SPAWN = { x: 0, z: 6.2 };
const TURN_KEYS = { left: 'ArrowLeft', right: 'ArrowRight' };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export interface Point {
  x: number;
  z: number;
}

export function resolveCollisions(
  position: Point,
  obstacles: readonly Obstacle[],
  playerRadius = PLAYER_RADIUS,
): Point {
  let { x, z } = position;
  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
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
  return { x: clamp(x, -ARENA_LIMIT, ARENA_LIMIT), z: clamp(z, -ARENA_LIMIT, ARENA_LIMIT) };
}

const MOVEMENT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const RUN_KEYS = ['ShiftLeft', 'ShiftRight'];

function isTextEntry(target: EventTarget | null): boolean {
  return (
    (typeof HTMLSelectElement !== 'undefined' && target instanceof HTMLSelectElement) ||
    (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) ||
    (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement)
  );
}

export class FirstPersonController {
  enabled = false;
  x = SPAWN.x;
  z = SPAWN.z;
  yaw = 0;
  pitch = INITIAL_PITCH;

  private keys = new Set<string>();
  private speed = 0;
  private phase = 0;
  private lastStep = 0;
  private dragging = false;
  private listeners = new AbortController();

  constructor(
    private camera: PerspectiveCamera,
    element: EventTarget,
    private getObstacles: () => readonly Obstacle[],
    private onStep: (running: boolean) => void,
    events: EventTarget = window,
  ) {
    const { signal } = this.listeners;

    events.addEventListener(
      'keydown',
      (raw) => {
        const event = raw as KeyboardEvent;
        if (!this.enabled || isTextEntry(event.target)) return;
        if (MOVEMENT_KEYS.has(event.code)) {
          this.keys.add(event.code);
          event.preventDefault();
        } else if (RUN_KEYS.includes(event.code)) {
          this.keys.add(event.code);
        }
      },
      { signal },
    );
    events.addEventListener(
      'keyup',
      (raw) => {
        this.keys.delete((raw as KeyboardEvent).code);
      },
      { signal },
    );
    events.addEventListener(
      'blur',
      () => {
        this.keys.clear();
      },
      { signal },
    );

    element.addEventListener(
      'pointerdown',
      () => {
        this.dragging = this.enabled;
      },
      { signal },
    );
    const stopDragging = () => {
      this.dragging = false;
    };
    events.addEventListener('pointerup', stopDragging, { signal });
    events.addEventListener('pointercancel', stopDragging, { signal });
    events.addEventListener(
      'pointermove',
      (raw) => {
        const event = raw as PointerEvent;
        if (!this.dragging || !this.enabled) return;
        this.yaw -= event.movementX * LOOK_SENSITIVITY;
        this.pitch = clamp(this.pitch - event.movementY * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
      },
      { signal },
    );
  }

  activate() {
    this.enabled = true;
    this.camera.rotation.order = 'YXZ';
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();
  }

  deactivate() {
    this.enabled = false;
    this.dragging = false;
    this.keys.clear();
    this.speed = 0;
    this.camera.rotation.order = 'XYZ';
    this.camera.fov = OVERVIEW_FOV;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.listeners.abort();
    this.keys.clear();
    this.dragging = false;
  }

  get running() {
    return this.runHeld && Math.abs(this.speed) > RUNNING_SPEED;
  }

  private get runHeld() {
    return RUN_KEYS.some((code) => this.keys.has(code));
  }

  private axis(positive: string, negative: string) {
    return (this.keys.has(positive) ? 1 : 0) - (this.keys.has(negative) ? 1 : 0);
  }

  update(dt: number) {
    if (!this.enabled) return;
    this.yaw += this.axis(TURN_KEYS.left, TURN_KEYS.right) * TURN_SPEED * dt;
    this.advance(dt);
    this.animateStride(dt);
    this.updateFov(dt);
  }

  private advance(dt: number) {
    const forward = this.axis('ArrowUp', 'ArrowDown');
    const topSpeed = this.runHeld ? RUN_SPEED : WALK_SPEED;
    const target = forward * topSpeed * (forward < 0 ? BACKWARD_SPEED_FACTOR : 1);
    this.speed += (target - this.speed) * Math.min(1, dt * SPEED_EASING);
    if (Math.abs(this.speed) < STOP_SPEED) this.speed = 0;

    const next = resolveCollisions(
      {
        x: this.x - Math.sin(this.yaw) * this.speed * dt,
        z: this.z - Math.cos(this.yaw) * this.speed * dt,
      },
      this.getObstacles(),
    );
    this.x = next.x;
    this.z = next.z;
  }

  private animateStride(dt: number) {
    const pace = Math.abs(this.speed);
    this.phase += (pace * dt * Math.PI) / STRIDE_LENGTH;
    const step = Math.floor(this.phase / Math.PI);
    if (step !== this.lastStep) {
      this.lastStep = step;
      if (pace > FOOTSTEP_MIN_SPEED) this.onStep(this.running);
    }

    const intensity = Math.min(pace / WALK_SPEED, MAX_BOB_INTENSITY);
    const stride = Math.sin(this.phase);
    const bob = (Math.abs(stride) - 0.5) * BOB_AMPLITUDE * intensity;
    const sway = stride * SWAY_AMPLITUDE * intensity;
    const roll = stride * ROLL_AMPLITUDE * intensity;
    const breath =
      pace < IDLE_SPEED ? Math.sin(performance.now() / BREATH_PERIOD_MS) * BREATH_AMPLITUDE : 0;

    this.camera.position.set(
      this.x + Math.cos(this.yaw) * sway,
      EYE_HEIGHT + bob + breath,
      this.z - Math.sin(this.yaw) * sway,
    );
    this.camera.rotation.set(this.pitch, this.yaw, roll);
  }

  private updateFov(dt: number) {
    const targetFov = this.running ? RUN_FOV : BASE_FOV;
    if (Math.abs(this.camera.fov - targetFov) <= 0.05) return;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * FOV_EASING);
    this.camera.updateProjectionMatrix();
  }
}
