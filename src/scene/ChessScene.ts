import {
  AmbientLight,
  BoxGeometry,
  Clock,
  Color as ThreeColor,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MoveEvent, Piece } from '../engine/game';
import { createPieceMesh } from './models';
import { SQUARE_SIZE, squareToPosition } from './coords';
import { Tweens, easeInOut } from './tween';

const MOVE_SECONDS = 0.8;

export class ChessScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new Clock();
  private tweens = new Tweens();
  private meshes = new Map<string, Group>();

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

  private frame() {
    this.tweens.update(this.clock.getDelta());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private addPiece(piece: Piece) {
    const mesh = createPieceMesh(piece.type, piece.color);
    mesh.position.copy(squareToPosition(piece.square));
    this.scene.add(mesh);
    this.meshes.set(piece.id, mesh);
  }

  private removePiece(id: string) {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    this.scene.remove(mesh);
    this.meshes.delete(id);
  }

  sync(pieces: Piece[]) {
    for (const id of [...this.meshes.keys()]) this.removePiece(id);
    for (const piece of pieces) this.addPiece(piece);
  }

  async animateMove(event: MoveEvent) {
    const animations: Promise<void>[] = [
      this.slide(event.mover.id, event.to, event.mover.type === 'n' ? 0.7 : 0),
    ];
    if (event.castleRook) {
      animations.push(this.slide(event.castleRook.piece.id, event.castleRook.to, 0.4));
    }
    if (event.captured) animations.push(this.destroy(event.captured.id));
    await Promise.all(animations);

    if (event.promotion) {
      this.removePiece(event.mover.id);
      this.addPiece({ ...event.mover, type: event.promotion, square: event.to });
    }
  }

  private slide(id: string, to: Piece['square'], hop: number): Promise<void> {
    const mesh = this.meshes.get(id);
    if (!mesh) return Promise.resolve();
    const start = mesh.position.clone();
    const end = squareToPosition(to);
    return this.tweens.run(MOVE_SECONDS, (t) => {
      const e = easeInOut(t);
      mesh.position.lerpVectors(start, end, e);
      mesh.position.y = Math.sin(Math.PI * e) * hop;
    });
  }

  private async destroy(id: string) {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    const delay = MOVE_SECONDS * 0.7;
    await this.tweens.run(delay, () => {});
    await this.tweens.run(0.5, (t) => {
      mesh.rotation.z = t * (Math.PI / 2);
      mesh.position.y = -t * 0.5;
      mesh.scale.setScalar(1 - t * 0.9);
    });
    this.removePiece(id);
  }
}
