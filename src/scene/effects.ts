import {
  BoxGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
  Vector3,
} from 'three';

export const COLORS = {
  dust: 0xcfc3a8,
  spark: 0xffd166,
  gold: 0xf2c744,
};

const DEFAULT_GRAVITY = 6;
const FLOOR_HEIGHT = 0.02;
const FLOOR_FRICTION = 0.8;
const SPEED_JITTER = { min: 0.4, range: 0.6 };
const SIZE_JITTER = { min: 0.6, range: 0.8 };
const LIFT_JITTER = { min: 0.5, range: 0.5 };
const RING_INNER_RADIUS = 0.85;
const RING_SEGMENTS = 32;
const SHOCKWAVE_HEIGHT = 0.03;
const SHOCKWAVE_SECONDS = 0.5;
const SHOCKWAVE_START_SCALE = 0.2;

export interface EmitOptions {
  position: Vector3;
  count: number;
  color: number;
  speed: number;
  up: number;
  size: number;
  life: number;
  gravity?: number;
}

interface Burst {
  material: MeshBasicMaterial;
  pool: MaterialPool;
  live: number;
}

interface Particle {
  mesh: Mesh;
  burst: Burst;
  velocity: Vector3;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  growth: number;
}

class MaterialPool {
  private free: MeshBasicMaterial[] = [];
  private all = new Set<MeshBasicMaterial>();

  constructor(
    private color: number,
    private doubleSided: boolean,
  ) {}

  acquire(): MeshBasicMaterial {
    const reused = this.free.pop();
    if (reused) return reused;
    const material = new MeshBasicMaterial({
      color: this.color,
      transparent: true,
      side: this.doubleSided ? DoubleSide : undefined,
    });
    this.all.add(material);
    return material;
  }

  release(material: MeshBasicMaterial) {
    material.opacity = 1;
    this.free.push(material);
  }

  get created() {
    return this.all.size;
  }

  dispose() {
    for (const material of this.all) material.dispose();
    this.all.clear();
    this.free.length = 0;
  }
}

const randomIn = ({ min, range }: { min: number; range: number }) => min + Math.random() * range;

export class ParticleSystem {
  private particles: Particle[] = [];
  private cube = new BoxGeometry(1, 1, 1);
  private ring = new RingGeometry(RING_INNER_RADIUS, 1, RING_SEGMENTS);
  private pools = new Map<string, MaterialPool>();

  constructor(private scene: Scene) {}

  get count() {
    return this.particles.length;
  }

  get materialCount() {
    let total = 0;
    for (const pool of this.pools.values()) total += pool.created;
    return total;
  }

  emit({ position, count, color, speed, up, size, life, gravity = DEFAULT_GRAVITY }: EmitOptions) {
    if (count <= 0) return;
    const pool = this.poolFor(color, false);
    const burst: Burst = { material: pool.acquire(), pool, live: count };
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const strength = speed * randomIn(SPEED_JITTER);
      const scale = size * randomIn(SIZE_JITTER);
      const mesh = new Mesh(this.cube, burst.material);
      mesh.position.copy(position);
      mesh.scale.setScalar(scale);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        burst,
        velocity: new Vector3(
          Math.cos(angle) * strength,
          up * randomIn(LIFT_JITTER),
          Math.sin(angle) * strength,
        ),
        gravity,
        life,
        maxLife: life,
        size: scale,
        growth: 0,
      });
    }
  }

  shockwave(position: Vector3, color: number, radius: number) {
    const pool = this.poolFor(color, true);
    const burst: Burst = { material: pool.acquire(), pool, live: 1 };
    const mesh = new Mesh(this.ring, burst.material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, SHOCKWAVE_HEIGHT, position.z);
    mesh.scale.setScalar(SHOCKWAVE_START_SCALE);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      burst,
      velocity: new Vector3(),
      gravity: 0,
      life: SHOCKWAVE_SECONDS,
      maxLife: SHOCKWAVE_SECONDS,
      size: SHOCKWAVE_START_SCALE,
      growth: radius / SHOCKWAVE_SECONDS,
    });
  }

  update(dt: number) {
    let kept = 0;
    for (const particle of this.particles) {
      particle.life -= dt;
      if (particle.life <= 0) {
        this.retire(particle);
        continue;
      }
      this.advance(particle, dt);
      this.particles[kept++] = particle;
    }
    this.particles.length = kept;
  }

  dispose() {
    for (const particle of this.particles) this.scene.remove(particle.mesh);
    this.particles.length = 0;
    for (const pool of this.pools.values()) pool.dispose();
    this.pools.clear();
    this.cube.dispose();
    this.ring.dispose();
  }

  private poolFor(color: number, doubleSided: boolean): MaterialPool {
    const key = `${color}:${doubleSided}`;
    let pool = this.pools.get(key);
    if (!pool) {
      pool = new MaterialPool(color, doubleSided);
      this.pools.set(key, pool);
    }
    return pool;
  }

  private retire(particle: Particle) {
    this.scene.remove(particle.mesh);
    const { burst } = particle;
    if (--burst.live === 0) burst.pool.release(burst.material);
  }

  private advance(particle: Particle, dt: number) {
    const { mesh, velocity } = particle;
    const ratio = particle.life / particle.maxLife;
    velocity.y -= particle.gravity * dt;
    mesh.position.addScaledVector(velocity, dt);
    if (particle.growth > 0) {
      particle.size += particle.growth * dt;
      mesh.scale.setScalar(particle.size);
    } else {
      if (mesh.position.y < FLOOR_HEIGHT) {
        mesh.position.y = FLOOR_HEIGHT;
        velocity.y = 0;
        velocity.multiplyScalar(FLOOR_FRICTION);
      }
      mesh.scale.setScalar(particle.size * ratio);
    }
    particle.burst.material.opacity = ratio;
  }
}
