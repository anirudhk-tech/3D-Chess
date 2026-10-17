import { BoxGeometry, Mesh, MeshBasicMaterial, RingGeometry, DoubleSide, type Scene, Vector3 } from 'three';

interface Particle {
  mesh: Mesh;
  velocity: Vector3;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  growth: number;
}

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

export const COLORS = {
  dust: 0xcfc3a8,
  spark: 0xffd166,
  gold: 0xf2c744,
};

export class ParticleSystem {
  private particles: Particle[] = [];
  private cube = new BoxGeometry(1, 1, 1);
  private ring = new RingGeometry(0.85, 1, 32);

  constructor(private scene: Scene) {}

  emit({ position, count, color, speed, up, size, life, gravity = 6 }: EmitOptions) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const strength = speed * (0.4 + Math.random() * 0.6);
      const mesh = new Mesh(this.cube, new MeshBasicMaterial({ color, transparent: true }));
      const scale = size * (0.6 + Math.random() * 0.8);
      mesh.position.copy(position);
      mesh.scale.setScalar(scale);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new Vector3(Math.cos(angle) * strength, up * (0.5 + Math.random() * 0.5), Math.sin(angle) * strength),
        gravity,
        life,
        maxLife: life,
        size: scale,
        growth: 0,
      });
    }
  }

  shockwave(position: Vector3, color: number, radius: number) {
    const mesh = new Mesh(this.ring, new MeshBasicMaterial({ color, transparent: true, side: DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, 0.03, position.z);
    mesh.scale.setScalar(0.2);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      velocity: new Vector3(),
      gravity: 0,
      life: 0.5,
      maxLife: 0.5,
      size: 0.2,
      growth: radius / 0.5,
    });
  }

  get count() {
    return this.particles.length;
  }

  update(dt: number) {
    const alive: Particle[] = [];
    for (const particle of this.particles) {
      particle.life -= dt;
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        (particle.mesh.material as MeshBasicMaterial).dispose();
        continue;
      }
      const ratio = particle.life / particle.maxLife;
      particle.velocity.y -= particle.gravity * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      if (particle.mesh.position.y < 0.02 && particle.growth === 0) {
        particle.mesh.position.y = 0.02;
        particle.velocity.y = 0;
        particle.velocity.multiplyScalar(0.8);
      }
      if (particle.growth > 0) {
        particle.size += particle.growth * dt;
        particle.mesh.scale.setScalar(particle.size);
      } else {
        particle.mesh.scale.setScalar(particle.size * ratio);
      }
      (particle.mesh.material as MeshBasicMaterial).opacity = ratio;
      alive.push(particle);
    }
    this.particles = alive;
  }
}
