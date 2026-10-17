import type { BufferGeometry, Euler, Object3D, Vector3 } from 'three';
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { Color, PieceSymbol } from '../engine/game';

const ROD_SIDES = 6;
const KING_LEG_SCALE = 1.3;
const WHITE_HOME_YAW = Math.PI;
const BLACK_HOME_YAW = 0;

const PIECE_SCALE: Record<PieceSymbol, number> = {
  p: 0.9,
  r: 0.9,
  b: 1,
  q: 1.08,
  k: 1.12,
  n: 0.95,
};

type Palette = Record<'cloth' | 'accent' | 'metal' | 'gold' | 'skin', MeshStandardMaterial>;

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

const geometryCache = new Map<string, BufferGeometry>();

function cached(key: string, create: () => BufferGeometry): BufferGeometry {
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = create();
    geometryCache.set(key, geometry);
  }
  return geometry;
}

const box = (w: number, h: number, d: number) =>
  cached(`box:${w},${h},${d}`, () => new BoxGeometry(w, h, d));
const pyramid = (radius: number, height: number, sides = 3) =>
  cached(`cone:${radius},${height},${sides}`, () => new ConeGeometry(radius, height, sides));
const cylinder = (top: number, bottom: number, height: number, sides: number) =>
  cached(
    `cyl:${top},${bottom},${height},${sides}`,
    () => new CylinderGeometry(top, bottom, height, sides),
  );
const rod = (radius: number, length: number) => cylinder(radius, radius, length, ROD_SIDES);
const sphere = (radius: number, widthSegments: number, heightSegments: number) =>
  cached(
    `sphere:${radius},${widthSegments},${heightSegments}`,
    () => new SphereGeometry(radius, widthSegments, heightSegments),
  );

function triangleHead(p: Palette, y: number, size = 1): Mesh {
  return part(pyramid(0.17 * size, 0.3 * size), p.skin, [0, y, 0], [Math.PI, 0, 0], 'head');
}

function arm(p: Palette, side: 1 | -1, shoulderY: number, shoulderX: number, length = 0.36): Group {
  const pivot = new Group();
  pivot.name = side === 1 ? 'armR' : 'armL';
  pivot.position.set(side * shoulderX, shoulderY, 0);
  pivot.add(part(box(0.07, length, 0.07), p.cloth, [0, -length / 2, 0]));
  pivot.add(part(sphere(0.05, 6, 6), p.skin, [0, -length, 0]));
  return pivot;
}

function legPivot(
  material: MeshStandardMaterial,
  x: number,
  topY: number,
  z: number,
  height: number,
  width: number,
  name: string,
): Group {
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
  group.add(part(cylinder(radius, radius, 0.06, 10), p.gold, [0, 0, 0]));
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    group.add(
      part(pyramid(0.04, height, 3), p.gold, [
        Math.cos(angle) * radius * 0.85,
        height / 2 + 0.03,
        Math.sin(angle) * radius * 0.85,
      ]),
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
  left.add(part(cylinder(0.14, 0.14, 0.04, 8), p.accent, [-0.04, -0.2, 0.06], [Math.PI / 2, 0, 0]));
  g.add(right, left);
  return g;
}

function wheel(p: Palette, x: number, z: number): Group {
  const group = new Group();
  group.name = 'wheel';
  group.position.set(x, 0.2, z);
  group.add(part(cylinder(0.2, 0.2, 0.1, 10), p.metal, [0, 0, 0], [0, 0, Math.PI / 2]));
  group.add(part(box(0.14, 0.42, 0.06), p.accent));
  group.add(part(box(0.14, 0.06, 0.42), p.accent));
  return group;
}

function siegeTower(p: Palette): Group {
  const height = 1.3;
  const radiusAt = (y: number) => 0.44 - (0.14 * y) / height;
  const tower = new Group();
  tower.name = 'tower';
  tower.position.y = 0.45;
  tower.add(
    part(cylinder(0.3, 0.44, height, 4), p.cloth, [0, height / 2, 0], [0, Math.PI / 4, 0], 'torso'),
  );
  for (const y of [0.25, 0.75]) {
    const r = radiusAt(y) + 0.02;
    tower.add(part(cylinder(r, r, 0.07, 4), p.metal, [0, y, 0], [0, Math.PI / 4, 0]));
  }
  tower.add(part(box(0.7, 0.08, 0.7), p.metal, [0, height + 0.04, 0]));
  for (const x of [-0.27, 0, 0.27]) {
    for (const z of [-0.27, 0, 0.27]) {
      if (x === 0 && z === 0) continue;
      tower.add(part(box(0.14, 0.16, 0.14), p.metal, [x, height + 0.16, z]));
    }
  }
  for (const side of [-1, 1]) {
    tower.add(
      part(pyramid(0.07, 0.55, 4), p.metal, [side * 0.28, height + 0.45, 0], [0, 0, -side * 0.45]),
    );
    tower.add(part(box(0.13, 0.04, 0.03), p.gold, [side * 0.09, 0.92, 0.27], [0, 0, -side * 0.45]));
  }
  tower.add(part(box(0.32, 0.15, 0.05), p.accent, [0, 0.58, 0.272]));
  for (const x of [-0.12, -0.04, 0.04, 0.12]) {
    tower.add(part(pyramid(0.03, 0.08, 3), p.metal, [x, 0.65, 0.3], [Math.PI, 0, 0]));
    tower.add(part(pyramid(0.03, 0.08, 3), p.metal, [x, 0.51, 0.3]));
  }
  tower.add(part(rod(0.015, 0.7), p.metal, [-0.24, height + 0.55, -0.24]));
  tower.add(
    part(pyramid(0.12, 0.32, 3), p.accent, [-0.08, height + 0.7, -0.24], [0, 0, -Math.PI / 2]),
  );
  tower.add(part(box(0.09, 0.14, 0.05), p.cloth, [0.1, height + 0.3, 0.05]));
  tower.add(part(pyramid(0.04, 0.09, 3), p.skin, [0.1, height + 0.42, 0.05], [Math.PI, 0, 0]));
  return tower;
}

function rook(p: Palette): Group {
  const g = new Group();
  g.add(part(box(0.78, 0.2, 0.86), p.cloth, [0, 0.34, 0]));
  g.add(part(box(0.82, 0.06, 0.9), p.accent, [0, 0.46, 0]));
  for (const x of [-0.44, 0.44]) {
    for (const z of [-0.28, 0.28]) g.add(wheel(p, x, z));
  }
  for (const side of [-1, 1]) {
    for (const z of [-0.3, 0.05]) {
      g.add(
        part(pyramid(0.06, 0.2, 4), p.metal, [side * 0.5, 0.4, z], [0, 0, (-side * Math.PI) / 2]),
      );
    }
  }
  g.add(siegeTower(p));

  const ram = new Group();
  ram.name = 'ram';
  ram.position.set(0, 0.4, 0.05);
  ram.add(part(rod(0.08, 0.8), p.cloth, [0, 0, 0], [Math.PI / 2, 0, 0]));
  for (const z of [-0.2, 0.1]) {
    ram.add(part(cylinder(0.095, 0.095, 0.05, 8), p.metal, [0, 0, z], [Math.PI / 2, 0, 0]));
  }
  ram.add(part(pyramid(0.14, 0.26, 4), p.metal, [0, 0, 0.53], [Math.PI / 2, 0, 0]));
  for (const side of [-1, 1]) {
    ram.add(
      part(
        pyramid(0.04, 0.2, 3),
        p.metal,
        [side * 0.12, 0.08, 0.42],
        [Math.PI / 2 - 0.4, 0, -side * 0.3],
      ),
    );
  }
  g.add(ram);
  return g;
}

function bishop(p: Palette): Group {
  const g = new Group();
  g.add(part(cylinder(0.14, 0.32, 0.82, 6), p.cloth, [0, 0.41, 0], [0, 0, 0], 'torso'));
  g.add(part(cylinder(0.15, 0.15, 0.08, 6), p.accent, [0, 0.7, 0]));
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
  staff.add(part(sphere(0.07, 8, 8), p.accent, [0, 0.72, 0]));
  right.add(staff);
  left.rotation.x = -0.6;
  g.add(right, left);
  return g;
}

function queen(p: Palette): Group {
  const g = new Group();
  g.add(part(cylinder(0.1, 0.36, 0.86, 8), p.cloth, [0, 0.43, 0], [0, 0, 0], 'torso'));
  g.add(part(cylinder(0.17, 0.12, 0.2, 8), p.accent, [0, 0.76, 0]));
  g.add(part(box(0.3, 0.05, 0.16), p.accent, [0, 0.88, 0]));
  g.add(triangleHead(p, 1.08, 0.95));
  g.add(crown(p, 1.28, 5, 0.14, 0.2));
  const right = arm(p, 1, 0.86, 0.19, 0.34);
  const left = arm(p, -1, 0.86, 0.19, 0.34);
  const scepter = new Group();
  scepter.position.set(0.03, -0.3, 0.08);
  scepter.add(part(rod(0.02, 0.9), p.gold));
  scepter.add(part(sphere(0.08, 8, 8), p.accent, [0, 0.5, 0]));
  right.add(scepter);
  left.rotation.z = 0.15;
  g.add(right, left);
  return g;
}

function king(p: Palette): Group {
  const g = new Group();
  for (const leg of legs(p, 0.36)) {
    leg.scale.set(KING_LEG_SCALE, 1, KING_LEG_SCALE);
    g.add(leg);
  }
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

interface RigBase {
  root: Group;
  facing: Group;
  figure: Group;
  homeYaw: number;
  busy: boolean;
  rest: Map<Object3D, RestPose>;
}

export interface HumanoidRig extends RigBase {
  type: 'p' | 'b' | 'q' | 'k';
  armL: Group;
  armR: Group;
  legs: Group[];
  head: Object3D;
}

export interface KnightRig extends RigBase {
  type: 'n';
  armL: Group;
  armR: Group;
  legs: [Group, Group, Group, Group];
  head: Object3D;
  neck: Object3D;
  horseHead: Object3D;
  tail: Object3D;
}

export interface SiegeRig extends RigBase {
  type: 'r';
  wheels: Group[];
  ram: Group;
  tower: Group;
}

export type PieceRig = HumanoidRig | KnightRig | SiegeRig;

function requireNode(figure: Object3D, name: string): Object3D {
  const node = figure.getObjectByName(name);
  if (!node) throw new Error(`Piece model is missing "${name}"`);
  return node;
}

function requireGroup(figure: Object3D, name: string): Group {
  const node = requireNode(figure, name);
  if (!(node instanceof Group)) throw new Error(`Piece model node "${name}" is not a group`);
  return node as Group;
}

function collectGroups(figure: Object3D, matches: (name: string) => boolean): Group[] {
  const found: Group[] = [];
  figure.traverse((node) => {
    if (node instanceof Group && matches(node.name)) found.push(node as Group);
  });
  return found;
}

function recordRest(rest: Map<Object3D, RestPose>, nodes: Object3D[]) {
  for (const node of nodes)
    rest.set(node, { rotation: node.rotation.clone(), position: node.position.clone() });
}

function humanoidRig(type: HumanoidRig['type'], base: RigBase): HumanoidRig {
  const { figure } = base;
  const rig: HumanoidRig = {
    ...base,
    type,
    armL: requireGroup(figure, 'armL'),
    armR: requireGroup(figure, 'armR'),
    legs: collectGroups(figure, (name) => name.startsWith('leg')),
    head: requireNode(figure, 'head'),
  };
  recordRest(base.rest, [rig.armL, rig.armR, ...rig.legs, rig.head]);
  return rig;
}

function knightRig(base: RigBase): KnightRig {
  const { figure } = base;
  const [a, b, c, d] = collectGroups(figure, (name) => name.startsWith('leg'));
  if (!a || !b || !c || !d) throw new Error('Knight model needs four legs');
  const rig: KnightRig = {
    ...base,
    type: 'n',
    armL: requireGroup(figure, 'armL'),
    armR: requireGroup(figure, 'armR'),
    legs: [a, b, c, d],
    head: requireNode(figure, 'head'),
    neck: requireNode(figure, 'neck'),
    horseHead: requireNode(figure, 'horseHead'),
    tail: requireNode(figure, 'tail'),
  };
  recordRest(base.rest, [
    rig.armL,
    rig.armR,
    ...rig.legs,
    rig.head,
    rig.neck,
    rig.horseHead,
    rig.tail,
  ]);
  return rig;
}

function siegeRig(base: RigBase): SiegeRig {
  const { figure } = base;
  const rig: SiegeRig = {
    ...base,
    type: 'r',
    wheels: collectGroups(figure, (name) => name === 'wheel'),
    ram: requireGroup(figure, 'ram'),
    tower: requireGroup(figure, 'tower'),
  };
  recordRest(base.rest, [rig.ram, rig.tower]);
  return rig;
}

export function createPieceRig(type: PieceSymbol, color: Color): PieceRig {
  const root = new Group();
  const facing = new Group();
  const figure = builders[type](palettes[color]);
  figure.scale.setScalar(PIECE_SCALE[type]);
  const homeYaw = color === 'w' ? WHITE_HOME_YAW : BLACK_HOME_YAW;
  facing.rotation.y = homeYaw;
  facing.add(figure);
  root.add(facing);

  const base: RigBase = { root, facing, figure, homeYaw, busy: false, rest: new Map() };
  switch (type) {
    case 'n':
      return knightRig(base);
    case 'r':
      return siegeRig(base);
    case 'p':
    case 'b':
    case 'q':
    case 'k':
      return humanoidRig(type, base);
  }
}

export function restAngle(rig: PieceRig, node: Object3D, axis: 'x' | 'y' | 'z'): number {
  return rig.rest.get(node)?.rotation[axis] ?? 0;
}

export function resetToRest(rig: PieceRig) {
  for (const [node, rest] of rig.rest) {
    node.rotation.copy(rest.rotation);
    node.position.copy(rest.position);
  }
  rig.figure.rotation.set(0, 0, 0);
  rig.figure.position.set(0, 0, 0);
  rig.facing.scale.y = 1;
}

export function disposeModelAssets() {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
  for (const palette of Object.values(palettes)) {
    for (const material of Object.values<MeshStandardMaterial>(palette)) material.dispose();
  }
}
