import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Color, PieceSymbol } from '../engine/game';

interface Palette {
  cloth: MeshStandardMaterial;
  accent: MeshStandardMaterial;
  metal: MeshStandardMaterial;
  gold: MeshStandardMaterial;
  skin: MeshStandardMaterial;
}

const flat = (color: number, metalness = 0.1, roughness = 0.7) =>
  new MeshStandardMaterial({ color, metalness, roughness, flatShading: true });

const palettes: Record<Color, Palette> = {
  w: {
    cloth: flat(0xe9e1cc),
    accent: flat(0x3b74e0),
    metal: flat(0xc5ccd6, 0.5, 0.4),
    gold: flat(0xf2c744, 0.6, 0.35),
    skin: flat(0xf4d9b8),
  },
  b: {
    cloth: flat(0x34343f),
    accent: flat(0xc23a2e),
    metal: flat(0x6f7480, 0.5, 0.4),
    gold: flat(0xd9a02b, 0.6, 0.35),
    skin: flat(0xb99478),
  },
};

type Vec3 = [number, number, number];

function part(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  position: Vec3 = [0, 0, 0],
  rotation: Vec3 = [0, 0, 0],
  name?: string,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  return mesh;
}

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
const pyramid = (radius: number, height: number, sides = 3) => new ConeGeometry(radius, height, sides);
const rod = (radius: number, length: number) => new CylinderGeometry(radius, radius, length, 6);

function triangleHead(p: Palette, y: number, size = 1): Mesh {
  return part(pyramid(0.17 * size, 0.3 * size), p.skin, [0, y, 0], [Math.PI, 0, 0], 'head');
}

function arm(p: Palette, side: 1 | -1, shoulderY: number, shoulderX: number, length = 0.36): Group {
  const pivot = new Group();
  pivot.name = side === 1 ? 'armR' : 'armL';
  pivot.position.set(side * shoulderX, shoulderY, 0);
  pivot.add(part(box(0.07, length, 0.07), p.cloth, [0, -length / 2, 0]));
  pivot.add(part(new SphereGeometry(0.05, 6, 6), p.skin, [0, -length, 0]));
  return pivot;
}

function legPivot(material: MeshStandardMaterial, x: number, topY: number, z: number, height: number, width: number, name: string): Group {
  const pivot = new Group();
  pivot.name = name;
  pivot.position.set(x, topY, z);
  pivot.add(part(box(width, height, width), material, [0, -height / 2, 0]));
  return pivot;
}

function legs(p: Palette, height = 0.4): Group[] {
  return ([-1, 1] as const).map((side) =>
    legPivot(p.accent, side * 0.08, height, 0, height, 0.1, side === 1 ? 'legR' : 'legL'),
  );
}

function spear(p: Palette, length: number): Group {
  const group = new Group();
  group.add(part(rod(0.02, length), p.metal, [0, 0, 0]));
  group.add(part(pyramid(0.06, 0.2), p.metal, [0, length / 2 + 0.1, 0]));
  return group;
}

function crown(p: Palette, y: number, points: number, radius: number, height: number): Group {
  const group = new Group();
  group.position.y = y;
  group.add(part(new CylinderGeometry(radius, radius, 0.06, 10), p.gold, [0, 0, 0]));
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    group.add(
      part(pyramid(0.04, height, 3), p.gold, [Math.cos(angle) * radius * 0.85, height / 2 + 0.03, Math.sin(angle) * radius * 0.85]),
    );
  }
  return group;
}

function pawn(p: Palette): Group {
  const g = new Group();
  g.add(...legs(p, 0.34));
  g.add(part(box(0.3, 0.36, 0.16), p.cloth, [0, 0.52, 0], [0, 0, 0], 'torso'));
  g.add(part(box(0.3, 0.08, 0.17), p.accent, [0, 0.38, 0]));
  g.add(triangleHead(p, 0.86, 0.9));
  g.add(part(pyramid(0.14, 0.14, 3), p.metal, [0, 1.06, 0]));
  const right = arm(p, 1, 0.66, 0.2, 0.32);
  const left = arm(p, -1, 0.66, 0.2, 0.32);
  const lance = spear(p, 1.1);
  lance.position.set(0.04, -0.28, 0.06);
  right.add(lance);
  left.add(part(new CylinderGeometry(0.14, 0.14, 0.04, 8), p.accent, [-0.04, -0.2, 0.06], [Math.PI / 2, 0, 0]));
  g.add(right, left);
  g.scale.setScalar(0.9);
  return g;
}

function rook(p: Palette): Group {
  const g = new Group();
  g.add(...legs(p, 0.34).map((l) => ((l.scale.x = 1.5), (l.scale.z = 1.5), l)));
  g.add(part(box(0.46, 0.46, 0.26), p.metal, [0, 0.57, 0], [0, 0, 0], 'torso'));
  g.add(part(box(0.5, 0.1, 0.3), p.accent, [0, 0.38, 0]));
  g.add(part(box(0.58, 0.12, 0.28), p.metal, [0, 0.84, 0]));
  g.add(triangleHead(p, 0.95, 1));
  const helm = new Group();
  helm.position.y = 1.12;
  helm.add(part(box(0.34, 0.12, 0.3), p.metal, [0, 0, 0]));
  for (const x of [-0.12, 0, 0.12]) helm.add(part(box(0.07, 0.1, 0.07), p.metal, [x, 0.1, 0.11]));
  for (const x of [-0.12, 0, 0.12]) helm.add(part(box(0.07, 0.1, 0.07), p.metal, [x, 0.1, -0.11]));
  g.add(helm);
  const right = arm(p, 1, 0.78, 0.31, 0.34);
  const left = arm(p, -1, 0.78, 0.31, 0.34);
  right.add(part(box(0.08, 0.44, 0.08), p.metal, [0.02, -0.34, 0.12], [0.4, 0, 0]));
  right.add(part(box(0.2, 0.16, 0.16), p.metal, [0.02, -0.52, 0.2]));
  left.add(part(box(0.06, 0.62, 0.34), p.accent, [-0.1, -0.3, 0.1]));
  left.add(part(box(0.08, 0.5, 0.08), p.gold, [-0.13, -0.3, 0.1]));
  g.add(right, left);
  return g;
}

function bishop(p: Palette): Group {
  const g = new Group();
  g.add(part(new CylinderGeometry(0.14, 0.32, 0.82, 6), p.cloth, [0, 0.41, 0], [0, 0, 0], 'torso'));
  g.add(part(new CylinderGeometry(0.15, 0.15, 0.08, 6), p.accent, [0, 0.7, 0]));
  g.add(part(box(0.34, 0.06, 0.2), p.accent, [0, 0.76, 0]));
  g.add(triangleHead(p, 0.98, 0.95));
  g.add(part(pyramid(0.17, 0.5, 3), p.accent, [0, 1.38, 0]));
  g.add(part(box(0.04, 0.12, 0.04), p.gold, [0, 1.68, 0]));
  g.add(part(box(0.1, 0.04, 0.04), p.gold, [0, 1.7, 0]));
  const right = arm(p, 1, 0.74, 0.19, 0.34);
  const left = arm(p, -1, 0.74, 0.19, 0.34);
  const staff = new Group();
  staff.position.set(0.04, -0.3, 0.1);
  staff.add(part(rod(0.02, 1.4), p.gold));
  staff.add(part(new SphereGeometry(0.07, 8, 8), p.accent, [0, 0.72, 0]));
  right.add(staff);
  left.rotation.x = -0.6;
  g.add(right, left);
  return g;
}

function queen(p: Palette): Group {
  const g = new Group();
  g.add(part(new CylinderGeometry(0.1, 0.36, 0.86, 8), p.cloth, [0, 0.43, 0], [0, 0, 0], 'torso'));
  g.add(part(new CylinderGeometry(0.17, 0.12, 0.2, 8), p.accent, [0, 0.76, 0]));
  g.add(part(box(0.3, 0.05, 0.16), p.accent, [0, 0.88, 0]));
  g.add(triangleHead(p, 1.08, 0.95));
  g.add(crown(p, 1.28, 5, 0.14, 0.2));
  const right = arm(p, 1, 0.86, 0.19, 0.34);
  const left = arm(p, -1, 0.86, 0.19, 0.34);
  const scepter = new Group();
  scepter.position.set(0.03, -0.3, 0.08);
  scepter.add(part(rod(0.02, 0.9), p.gold));
  scepter.add(part(new SphereGeometry(0.08, 8, 8), p.accent, [0, 0.5, 0]));
  right.add(scepter);
  left.rotation.z = 0.15;
  g.add(right, left);
  g.scale.setScalar(1.08);
  return g;
}

function king(p: Palette): Group {
  const g = new Group();
  g.add(...legs(p, 0.36).map((l) => ((l.scale.x = 1.3), (l.scale.z = 1.3), l)));
  g.add(part(box(0.4, 0.46, 0.22), p.cloth, [0, 0.6, 0], [0, 0, 0], 'torso'));
  g.add(part(box(0.44, 0.08, 0.26), p.gold, [0, 0.4, 0]));
  g.add(part(box(0.5, 0.1, 0.24), p.accent, [0, 0.86, 0]));
  g.add(part(box(0.44, 0.7, 0.04), p.accent, [0, 0.56, -0.15], [0.08, 0, 0], 'cape'));
  g.add(triangleHead(p, 1.0, 1));
  g.add(crown(p, 1.22, 4, 0.15, 0.18));
  g.add(part(box(0.04, 0.2, 0.04), p.gold, [0, 1.46, 0]));
  g.add(part(box(0.14, 0.04, 0.04), p.gold, [0, 1.5, 0]));
  const right = arm(p, 1, 0.8, 0.27, 0.36);
  const left = arm(p, -1, 0.8, 0.27, 0.36);
  const sword = new Group();
  sword.position.set(0.03, -0.34, 0.08);
  sword.add(part(box(0.06, 0.8, 0.02), p.metal, [0, 0.4, 0]));
  sword.add(part(pyramid(0.04, 0.12, 3), p.metal, [0, 0.86, 0]));
  sword.add(part(box(0.24, 0.05, 0.05), p.gold, [0, 0, 0]));
  right.add(sword);
  g.add(right, left);
  g.scale.setScalar(1.12);
  return g;
}

function knight(p: Palette): Group {
  const g = new Group();
  const horse = new Group();
  horse.add(part(box(0.34, 0.32, 0.7), p.cloth, [0, 0.5, 0], [0, 0, 0], 'torso'));
  horse.add(part(box(0.36, 0.12, 0.5), p.accent, [0, 0.62, -0.02]));
  for (const x of [-0.11, 0.11]) {
    for (const z of [-0.24, 0.24]) {
      horse.add(legPivot(p.cloth, x, 0.36, z, 0.36, 0.08, 'legHorse'));
    }
  }
  horse.add(part(box(0.16, 0.5, 0.18), p.cloth, [0, 0.82, 0.34], [0.5, 0, 0], 'neck'));
  horse.add(part(box(0.15, 0.17, 0.34), p.cloth, [0, 1.02, 0.55], [0.2, 0, 0], 'horseHead'));
  for (const x of [-0.05, 0.05]) horse.add(part(pyramid(0.04, 0.12, 3), p.cloth, [x, 1.17, 0.42]));
  horse.add(part(box(0.04, 0.4, 0.04), p.accent, [0, 0.94, 0.24], [0.5, 0, 0]));
  horse.add(part(pyramid(0.1, 0.4, 3), p.accent, [0, 0.5, -0.46], [-2.3, 0, 0], 'tail'));
  g.add(horse);

  const rider = new Group();
  rider.position.y = 0.52;
  rider.add(part(box(0.26, 0.34, 0.15), p.metal, [0, 0.34, -0.02], [0, 0, 0], 'riderTorso'));
  rider.add(triangleHead(p, 0.7, 0.8));
  rider.add(part(pyramid(0.12, 0.2, 3), p.metal, [0, 0.9, 0]));
  rider.add(part(box(0.06, 0.34, 0.06), p.accent, [-0.14, 0.18, 0.04], [0, 0, 0.3]));
  rider.add(part(box(0.06, 0.34, 0.06), p.accent, [0.14, 0.18, 0.04], [0, 0, -0.3]));
  const right = arm(p, 1, 0.48, 0.17, 0.28);
  const left = arm(p, -1, 0.48, 0.17, 0.28);
  const lance = spear(p, 1.3);
  lance.position.set(0.04, -0.16, 0.5);
  lance.rotation.x = Math.PI / 2 - 0.2;
  right.add(lance);
  right.rotation.x = -0.9;
  left.rotation.x = -0.5;
  rider.add(right, left);
  g.add(rider);
  g.scale.setScalar(0.95);
  return g;
}

const builders: Record<PieceSymbol, (p: Palette) => Group> = {
  p: pawn,
  r: rook,
  b: bishop,
  q: queen,
  k: king,
  n: knight,
};

export interface RestPose {
  rotation: Euler;
  position: Vector3;
}

export interface PieceRig {
  type: PieceSymbol;
  root: Group;
  facing: Group;
  figure: Group;
  homeYaw: number;
  busy: boolean;
  rest: Map<Object3D, RestPose>;
  armL?: Group;
  armR?: Group;
  legs: Group[];
  head?: Object3D;
  neck?: Object3D;
  horseHead?: Object3D;
  tail?: Object3D;
}

export function createPieceRig(type: PieceSymbol, color: Color): PieceRig {
  const root = new Group();
  const facing = new Group();
  const figure = builders[type](palettes[color]);
  const homeYaw = color === 'w' ? Math.PI : 0;
  facing.rotation.y = homeYaw;
  facing.add(figure);
  root.add(facing);

  const rig: PieceRig = { type, root, facing, figure, homeYaw, busy: false, rest: new Map(), legs: [] };
  figure.traverse((node) => {
    if (node.name === 'armL') rig.armL = node as Group;
    else if (node.name === 'armR') rig.armR = node as Group;
    else if (node.name.startsWith('leg')) rig.legs.push(node as Group);
    else if (node.name === 'head') rig.head = node;
    else if (node.name === 'neck') rig.neck = node;
    else if (node.name === 'horseHead') rig.horseHead = node;
    else if (node.name === 'tail') rig.tail = node;
    else return;
    node.userData.restX = node.rotation.x;
    rig.rest.set(node, { rotation: node.rotation.clone(), position: node.position.clone() });
  });
  return rig;
}
