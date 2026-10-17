import {
  Vector3,
  AmbientLight,
  BoxGeometry,
  Clock,
  Color as ThreeColor,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MoveEvent, Piece } from '../engine/game';
import { createPieceRig, type PieceRig } from './models';
import { die, sink, strike, turnTo, walk, yawToward } from './animations';
import { SQUARE_SIZE, squareToPosition } from './coords';
import { ParticleSystem } from './effects';
import { fx } from './fx';
import { IdleAnimator } from './idle';
import { Tweens } from './tween';

const STOP_SHORT = 0.75;
const KNIGHT_HOP = 0.4;

export class ChessScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new Clock();
  private tweens = new Tweens();
  private idle = new IdleAnimator();
  private particles: ParticleSystem;
  private shakeAmplitude = 0;
  private shakeSeconds = 0;
  private shakeRemaining = 0;
  private shakeOffset = new Vector3();
  private rigs = new Map<string, PieceRig>();

  constructor(container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new ThreeColor(0x1a1c22);
    this.camera = new PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 9, 9);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 25;

    this.particles = new ParticleSystem(this.scene);
    fx.attach(this.particles, (amplitude, seconds) => this.shake(amplitude, seconds));

    this.buildLights();
    this.buildBoard();

    window.addEventListener('resize', () => this.resize(container));
    this.resize(container);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private buildLights() {
    this.scene.add(new AmbientLight(0xffffff, 0.55));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(6, 12, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -7;
    sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    this.scene.add(sun);
  }

  private buildBoard() {
    const light = new MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.8 });
    const dark = new MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.8 });
    const geometry = new BoxGeometry(SQUARE_SIZE, 0.2, SQUARE_SIZE);
    for (let file = 0; file < 8; file++) {
      for (let rank = 0; rank < 8; rank++) {
        const tile = new Mesh(geometry, (file + rank) % 2 === 0 ? dark : light);
        tile.position.set((file - 3.5) * SQUARE_SIZE, -0.1, (3.5 - rank) * SQUARE_SIZE);
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }
    const frame = new Mesh(
      new BoxGeometry(8 * SQUARE_SIZE + 0.8, 0.3, 8 * SQUARE_SIZE + 0.8),
      new MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.7 }),
    );
    frame.position.y = -0.25;
    frame.receiveShadow = true;
    this.scene.add(frame);
  }

  private resize(container: HTMLElement) {
    const { clientWidth: w, clientHeight: h } = container;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  shake(amplitude: number, seconds: number) {
    if (amplitude < this.shakeAmplitude * (this.shakeRemaining / Math.max(this.shakeSeconds, 0.001))) return;
    this.shakeAmplitude = amplitude;
    this.shakeSeconds = seconds;
    this.shakeRemaining = seconds;
  }

  private frame() {
    const dt = this.clock.getDelta();
    this.tweens.update(dt);
    this.idle.update(dt, this.rigs.values());
    this.particles.update(dt);

    this.camera.position.sub(this.shakeOffset);
    this.controls.update();
    this.shakeOffset.set(0, 0, 0);
    if (this.shakeRemaining > 0) {
      this.shakeRemaining = Math.max(this.shakeRemaining - dt, 0);
      const strength = this.shakeAmplitude * (this.shakeRemaining / this.shakeSeconds);
      this.shakeOffset.set((Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength);
      this.camera.position.add(this.shakeOffset);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private addPiece(piece: Piece) {
    const rig = createPieceRig(piece.type, piece.color);
    rig.root.position.copy(squareToPosition(piece.square));
    this.scene.add(rig.root);
    this.rigs.set(piece.id, rig);
  }

  private removePiece(id: string) {
    const rig = this.rigs.get(id);
    if (!rig) return;
    this.scene.remove(rig.root);
    this.rigs.delete(id);
  }

  sync(pieces: Piece[]) {
    for (const id of [...this.rigs.keys()]) this.removePiece(id);
    for (const piece of pieces) this.addPiece(piece);
  }

  private setBusy(rigs: (PieceRig | undefined)[], busy: boolean) {
    for (const rig of rigs) {
      if (!rig) continue;
      if (busy) this.idle.release(rig);
      rig.busy = busy;
    }
  }

  async animateMove(event: MoveEvent) {
    const mover = this.rigs.get(event.mover.id);
    if (!mover) return;
    const victim = event.captured && this.rigs.get(event.captured.id);
    const castleRook = event.castleRook && this.rigs.get(event.castleRook.piece.id);
    const involved = [mover, victim, castleRook];
    this.setBusy(involved, true);

    if (event.captured) await this.attack(mover, event);
    else await this.march(mover, event);

    if (castleRook) await walk(this.tweens, castleRook, squareToPosition(event.castleRook!.to));

    this.setBusy(involved, false);

    if (event.promotion) fx.promotion(squareToPosition(event.to));
    if (event.checkmate) fx.checkmate();
    else if (event.check) fx.check();

    if (event.promotion) {
      this.removePiece(event.mover.id);
      this.addPiece({ ...event.mover, type: event.promotion, square: event.to });
    }
  }

  private hopFor(rig: PieceRig) {
    return rig.type === 'n' ? KNIGHT_HOP : 0;
  }

  private async march(rig: PieceRig, event: MoveEvent) {
    const from = squareToPosition(event.from);
    const to = squareToPosition(event.to);
    await turnTo(this.tweens, rig, yawToward(from, to));
    await walk(this.tweens, rig, to, this.hopFor(rig));
    await turnTo(this.tweens, rig, rig.homeYaw);
  }

  private async attack(attacker: PieceRig, event: MoveEvent) {
    const victim = this.rigs.get(event.captured!.id);
    const from = squareToPosition(event.from);
    const to = squareToPosition(event.to);
    if (!victim) return this.march(attacker, event);

    const victimPosition = victim.root.position.clone();
    const approach = victimPosition.clone().sub(from).setY(0).normalize();
    const stopPoint = victimPosition.clone().addScaledVector(approach, -STOP_SHORT);

    if (attacker.type === 'n') fx.whinny();
    await Promise.all([
      turnTo(this.tweens, attacker, yawToward(from, victimPosition)),
      turnTo(this.tweens, victim, yawToward(victimPosition, from)),
    ]);
    await walk(this.tweens, attacker, stopPoint, this.hopFor(attacker));

    let falling: Promise<void> = Promise.resolve();
    await strike(this.tweens, attacker, () => {
      fx.hit(attacker, victimPosition);
      falling = die(this.tweens, victim, approach.clone().multiplyScalar(0.3));
    });
    await falling;
    await this.tweens.wait(0.3);

    const sinking = sink(this.tweens, victim).then(() => this.removePiece(event.captured!.id));
    await walk(this.tweens, attacker, to);
    await turnTo(this.tweens, attacker, attacker.homeYaw);
    await sinking;
  }
}
