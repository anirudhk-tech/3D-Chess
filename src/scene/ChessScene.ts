import {
  AmbientLight,
  BoxGeometry,
  Color as ThreeColor,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MoveEvent, Piece } from '../engine/game';
import { die, sink, strike, turnTo, walk, yawToward } from './animations';
import { BOARD_SQUARES, SQUARE_SIZE, fileRankToPosition, squareToPosition } from './coords';
import { ParticleSystem } from './effects';
import { fx } from './fx';
import { FirstPersonController, OVERVIEW_FOV, type Obstacle } from './firstPerson';
import { IdleAnimator } from './idle';
import { createPieceRig, disposeModelAssets, type PieceRig } from './models';
import { CameraShake } from './shake';
import { Tweens } from './tween';

const STOP_SHORT = 0.75;
const KNIGHT_HOP = 0.4;
const KNOCKBACK = 0.3;
const PAUSE_BEFORE_SINK = 0.3;
const MAX_FRAME_SECONDS = 0.1;
const MAX_PIXEL_RATIO = 2;
const ROOK_OBSTACLE_RADIUS = 0.6;
const PIECE_OBSTACLE_RADIUS = 0.33;

const BACKGROUND_COLOR = 0x1a1c22;
const FOG = { near: 14, far: 45 };
const CAMERA = { near: 0.05, far: 120 };
const OVERVIEW_POSITION = new Vector3(0, 9, 9);
const ORBIT = { maxPolarAngle: Math.PI / 2.1, minDistance: 4, maxDistance: 25 };

const SUN = {
  position: new Vector3(6, 12, 5),
  intensity: 2.2,
  ambientIntensity: 0.55,
  shadowMapSize: 2048,
  shadowExtent: 7,
  shadowNear: 4,
  shadowFar: 32,
  shadowBias: -0.0004,
  shadowNormalBias: 0.02,
};

const BOARD = {
  light: 0xd9c9a3,
  dark: 0x7a5a3a,
  frame: 0x3b2a1a,
  ground: 0x2b2a24,
  tileHeight: 0.2,
  frameHeight: 0.3,
  frameMargin: 0.8,
  frameY: -0.25,
  groundY: -0.45,
  groundSize: 200,
};

export type ViewMode = 'walk' | 'overview';

interface Disposable {
  dispose(): void;
}

export class ChessScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private controls: OrbitControls;
  private firstPerson: FirstPersonController;
  private timer = new Timer();
  private tweens = new Tweens();
  private idle = new IdleAnimator();
  private particles: ParticleSystem;
  private cameraShake = new CameraShake();
  private shakeOffset = new Vector3();
  private rigs = new Map<string, PieceRig>();
  private obstacleOf = new Map<PieceRig, Obstacle>();
  private obstacleList: Obstacle[] = [];
  private owned: Disposable[] = [];
  private resizeObserver: ResizeObserver;
  private epoch = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new ThreeColor(BACKGROUND_COLOR);
    this.scene.fog = new Fog(BACKGROUND_COLOR, FOG.near, FOG.far);
    this.camera = new PerspectiveCamera(OVERVIEW_FOV, 1, CAMERA.near, CAMERA.far);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = ORBIT.maxPolarAngle;
    this.controls.minDistance = ORBIT.minDistance;
    this.controls.maxDistance = ORBIT.maxDistance;

    this.firstPerson = new FirstPersonController(
      this.camera,
      this.renderer.domElement,
      () => this.obstacleList,
      (running) => {
        fx.playerStep(running);
      },
    );
    this.timer.connect(document);
    this.setView('walk');

    this.particles = new ParticleSystem(this.scene);
    fx.attach(this.particles, (amplitude, seconds) => {
      this.cameraShake.trigger(amplitude, seconds);
    });

    this.buildLights();
    this.buildBoard();
    this.buildGround();

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.frame();
    });
  }

  get view(): ViewMode {
    return this.firstPerson.enabled ? 'walk' : 'overview';
  }

  setView(view: ViewMode) {
    if (view === 'walk') {
      this.controls.enabled = false;
      this.firstPerson.activate();
      return;
    }
    this.firstPerson.deactivate();
    this.controls.enabled = true;
    this.camera.position.copy(OVERVIEW_POSITION);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  toggleView() {
    this.setView(this.view === 'walk' ? 'overview' : 'walk');
  }

  sync(pieces: Piece[]) {
    this.epoch++;
    this.tweens.cancelAll();
    for (const rig of [...this.rigs.values()]) this.removeRig(rig);
    for (const piece of pieces) this.addPiece(piece);
  }

  async animateMove(event: MoveEvent) {
    const mover = this.rigs.get(event.mover.id);
    if (!mover) return;
    const epoch = this.epoch;
    const victim = event.captured ? this.rigs.get(event.captured.id) : undefined;
    const castleRook = event.castleRook ? this.rigs.get(event.castleRook.piece.id) : undefined;
    const involved = [mover, victim, castleRook];
    this.setBusy(involved, true);

    try {
      if (event.captured && victim) await this.attack(mover, victim, event);
      else await this.march(mover, event);
      if (castleRook && event.castleRook)
        await walk(this.tweens, castleRook, squareToPosition(event.castleRook.to));
    } finally {
      this.setBusy(involved, false);
    }

    if (epoch !== this.epoch) return;
    this.celebrate(event);
    if (event.promotion) this.promote(mover, event, event.promotion);
  }

  dispose() {
    this.epoch++;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.tweens.cancelAll();
    this.timer.dispose();
    this.firstPerson.dispose();
    this.controls.dispose();
    fx.detach();
    this.particles.dispose();
    for (const rig of [...this.rigs.values()]) this.removeRig(rig);
    for (const resource of this.owned) resource.dispose();
    this.owned = [];
    disposeModelAssets();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private own<T extends Disposable>(resource: T): T {
    this.owned.push(resource);
    return resource;
  }

  private buildLights() {
    this.scene.add(new AmbientLight(0xffffff, SUN.ambientIntensity));
    const sun = new DirectionalLight(0xffffff, SUN.intensity);
    sun.position.copy(SUN.position);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SUN.shadowMapSize, SUN.shadowMapSize);
    const { camera } = sun.shadow;
    camera.left = -SUN.shadowExtent;
    camera.right = SUN.shadowExtent;
    camera.top = SUN.shadowExtent;
    camera.bottom = -SUN.shadowExtent;
    camera.near = SUN.shadowNear;
    camera.far = SUN.shadowFar;
    sun.shadow.bias = SUN.shadowBias;
    sun.shadow.normalBias = SUN.shadowNormalBias;
    this.scene.add(sun);
  }

  private buildBoard() {
    const light = this.own(new MeshStandardMaterial({ color: BOARD.light, roughness: 0.8 }));
    const dark = this.own(new MeshStandardMaterial({ color: BOARD.dark, roughness: 0.8 }));
    const geometry = this.own(new BoxGeometry(SQUARE_SIZE, BOARD.tileHeight, SQUARE_SIZE));
    for (let file = 0; file < BOARD_SQUARES; file++) {
      for (let rank = 0; rank < BOARD_SQUARES; rank++) {
        const tile = new Mesh(geometry, (file + rank) % 2 === 0 ? dark : light);
        tile.position.copy(fileRankToPosition(file, rank, -BOARD.tileHeight / 2));
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }
    const frameSize = BOARD_SQUARES * SQUARE_SIZE + BOARD.frameMargin;
    const frame = new Mesh(
      this.own(new BoxGeometry(frameSize, BOARD.frameHeight, frameSize)),
      this.own(new MeshStandardMaterial({ color: BOARD.frame, roughness: 0.7 })),
    );
    frame.position.y = BOARD.frameY;
    frame.receiveShadow = true;
    this.scene.add(frame);
  }

  private buildGround() {
    const ground = new Mesh(
      this.own(new PlaneGeometry(BOARD.groundSize, BOARD.groundSize)),
      this.own(new MeshStandardMaterial({ color: BOARD.ground, roughness: 1 })),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = BOARD.groundY;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), MAX_FRAME_SECONDS);
    this.tweens.update(dt);
    this.idle.update(dt, this.rigs.values());
    this.particles.update(dt);
    this.trackObstacles();

    this.camera.position.sub(this.shakeOffset);
    if (this.firstPerson.enabled) this.firstPerson.update(dt);
    else this.controls.update();
    this.camera.position.add(this.cameraShake.advance(dt, this.shakeOffset));
    this.renderer.render(this.scene, this.camera);
  }

  private trackObstacles() {
    for (const [rig, obstacle] of this.obstacleOf) {
      obstacle.x = rig.root.position.x;
      obstacle.z = rig.root.position.z;
    }
  }

  private addPiece(piece: Piece) {
    const rig = createPieceRig(piece.type, piece.color);
    rig.root.position.copy(squareToPosition(piece.square));
    this.scene.add(rig.root);
    this.rigs.set(piece.id, rig);
    const obstacle = {
      x: rig.root.position.x,
      z: rig.root.position.z,
      radius: rig.type === 'r' ? ROOK_OBSTACLE_RADIUS : PIECE_OBSTACLE_RADIUS,
    };
    this.obstacleOf.set(rig, obstacle);
    this.obstacleList.push(obstacle);
    return rig;
  }

  private removeRig(rig: PieceRig) {
    this.scene.remove(rig.root);
    const obstacle = this.obstacleOf.get(rig);
    if (obstacle) {
      this.obstacleOf.delete(rig);
      this.obstacleList.splice(this.obstacleList.indexOf(obstacle), 1);
    }
    for (const [id, candidate] of this.rigs) {
      if (candidate === rig) this.rigs.delete(id);
    }
  }

  private setBusy(rigs: (PieceRig | undefined)[], busy: boolean) {
    for (const rig of rigs) {
      if (!rig) continue;
      if (busy) this.idle.release(rig);
      rig.busy = busy;
    }
  }

  private celebrate(event: MoveEvent) {
    if (event.promotion) fx.promotion(squareToPosition(event.to));
    if (event.checkmate) fx.checkmate();
    else if (event.check) fx.check();
  }

  private promote(
    mover: PieceRig,
    event: MoveEvent,
    promotion: NonNullable<MoveEvent['promotion']>,
  ) {
    this.removeRig(mover);
    this.addPiece({ ...event.mover, type: promotion, square: event.to });
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

  private async attack(attacker: PieceRig, victim: PieceRig, event: MoveEvent) {
    const from = squareToPosition(event.from);
    const to = squareToPosition(event.to);
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
      falling = die(this.tweens, victim, approach.clone().multiplyScalar(KNOCKBACK));
    });
    await falling;
    await this.tweens.wait(PAUSE_BEFORE_SINK);

    const sinking = sink(this.tweens, victim).then(() => {
      this.removeRig(victim);
    });
    await walk(this.tweens, attacker, to);
    await turnTo(this.tweens, attacker, attacker.homeYaw);
    await sinking;
  }
}
