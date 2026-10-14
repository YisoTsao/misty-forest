import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '@/game-core/util/random';

/**
 * 螢苔祕林的程式模型（任務 8A，Bible §6.3、§6.7）。素材包沒有樹根拱門、巨大蘑菇樹與發光植物，
 * 以管狀樹根、圓頂菌傘與小光點組合，配色依 Bible：深林綠 #386B53、螢光薄荷 #8DE6BE、藍紫陰影 #66678C。
 * 每個模型分成三種部件，各用一種材質：
 * - solid：一般 toon（樹根、菌柄、石頭）
 * - plant：薄面片植物（法線朝上、雙面）
 * - glow：自發光（不受光照、HDR 色觸發 Bloom）；Bible 要求發光只用於少數關鍵植物
 */
export type ForestModel = { solid?: THREE.BufferGeometry; plant?: THREE.BufferGeometry; glow?: THREE.BufferGeometry };

const c = (hex: string) => new THREE.Color(hex);
/** HDR 自發光色（乘上亮度後超過 Bloom 門檻） */
export const glowColor = (hex: string, power: number) => new THREE.Color(hex).multiplyScalar(power);

const MOSS = c('#386b53');
const MOSS_LIGHT = c('#5f9a6a');
const BARK = c('#6b4a35');
const BARK_DARK = c('#4c3426');
const MINT = '#8de6be';

export function paint(g: THREE.BufferGeometry, color: THREE.Color, jitter = 0, rand?: () => number): THREE.BufferGeometry {
  const n = g.attributes.position!.count;
  const colors = new Float32Array(n * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    tmp.copy(color);
    if (jitter > 0 && rand) tmp.multiplyScalar(1 - jitter + rand() * jitter * 2);
    tmp.toArray(colors, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function merge(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
  // 屬性一致：位置、法線、頂點色
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'color') g.deleteAttribute(key);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(flat);
  new Set([...parts, ...flat]).forEach((p) => p.dispose());
  if (!merged) throw new Error(`${name}幾何合併失敗`);
  merged.computeBoundingSphere();
  return merged;
}

export function sphere(radius: number, at: [number, number, number], color: THREE.Color, squash: [number, number, number] = [1, 1, 1], detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  g.scale(...squash);
  g.translate(...at);
  return paint(g, color);
}

export function cylinder(rTop: number, rBottom: number, height: number, at: [number, number, number], color: THREE.Color, segments = 8, rot: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1);
  g.translate(0, height / 2, 0);
  g.rotateX(rot[0]);
  g.rotateY(rot[1]);
  g.rotateZ(rot[2]);
  g.translate(...at);
  return paint(g, color);
}

/** 沿曲線的樹根（半徑由根部往末端變細） */
function root(points: [number, number, number][], radius: number, color: THREE.Color, taper = 0.45, segments = 18): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, segments, radius, 7, false);
  // 依沿線位置縮小半徑：TubeGeometry 的頂點按 segments+1 圈排列，每圈 radialSegments+1 個
  const pos = g.attributes.position as THREE.BufferAttribute;
  const ring = 8;
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const center = curve.getPointAt(t);
    const k = 1 - (1 - taper) * t;
    for (let r = 0; r < ring; r++) {
      const i = s * ring + r;
      const x = pos.getX(i) - center.x;
      const y = pos.getY(i) - center.y;
      const z = pos.getZ(i) - center.z;
      pos.setXYZ(i, center.x + x * k, center.y + y * k, center.z + z * k);
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return paint(g, color);
}

/** 平貼地面的不規則圓片（苔蘚地毯），法線朝上 */
function carpet(radius: number, color: THREE.Color, edge: THREE.Color, rand: () => number, y = 0.03): THREE.BufferGeometry {
  const n = 14;
  const positions: number[] = [0, y + 0.02, 0];
  const colors: number[] = [...color.toArray()];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * (0.7 + rand() * 0.45);
    positions.push(Math.cos(a) * r, y - 0.01, Math.sin(a) * r);
    colors.push(...edge.toArray());
  }
  const index: number[] = [];
  for (let i = 0; i < n; i++) index.push(0, 1 + ((i + 1) % n), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: n + 1 }, () => [0, 1, 0]).flat(), 3));
  g.setIndex(index);
  return g;
}

/** 一片斜向外伸的葉子（兩個三角形），法線朝上 */
export function leaf(angle: number, length: number, width: number, tilt: number, base: THREE.Color, tip: THREE.Color, y = 0): THREE.BufferGeometry {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const px = -dz * width;
  const pz = dx * width;
  const mid = length * 0.5;
  const pts = [
    [0, y, 0],
    [dx * Math.cos(tilt) * mid + px, y + Math.sin(tilt) * mid, dz * Math.cos(tilt) * mid + pz],
    [dx * Math.cos(tilt) * length, y + Math.sin(tilt) * length, dz * Math.cos(tilt) * length],
    [dx * Math.cos(tilt) * mid - px, y + Math.sin(tilt) * mid, dz * Math.cos(tilt) * mid - pz],
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([...base.toArray(), ...base.clone().lerp(tip, 0.5).toArray(), ...tip.toArray(), ...base.clone().lerp(tip, 0.5).toArray()], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** 螢光苔蘚地毯（`plant_glowmoss_patch`）：深綠苔面，點綴發光的小孢子球 */
function glowmossPatch(): ForestModel {
  const rand = mulberry32(811);
  const plant = [carpet(1.25, MOSS_LIGHT, MOSS, rand), carpet(0.7, c('#6fae7a'), MOSS_LIGHT, rand, 0.06)];
  const glow: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 1.05;
    const h = 0.06 + rand() * 0.12;
    glow.push(sphere(0.035 + rand() * 0.03, [Math.cos(a) * r, h, Math.sin(a) * r], glowColor(MINT, 1.5 + rand() * 0.6), [1, 1, 1], 0));
  }
  return { plant: merge(plant, '螢苔'), glow: merge(glow, '螢苔光點') };
}

/** 可採集的螢苔：小一點、光點較密，玩家一眼看出可以採 */
function glowmossTuft(): ForestModel {
  const rand = mulberry32(812);
  const plant = [carpet(0.55, c('#4f8f63'), MOSS, rand, 0.05)];
  for (let i = 0; i < 9; i++) plant.push(leaf((i / 9) * Math.PI * 2, 0.32, 0.08, 0.5, MOSS, c('#7fc49a'), 0.04));
  const glow: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.4;
    glow.push(sphere(0.05, [Math.cos(a) * r, 0.12 + rand() * 0.16, Math.sin(a) * r], glowColor(MINT, 1.9), [1, 1, 1], 0));
  }
  return { plant: merge(plant, '可採集螢苔'), glow: merge(glow, '可採集螢苔光點') };
}

/** 月露草（`plant_moondew`）：細長葉叢，頂端垂著幾朵淡藍白、會微微發光的鈴形花 */
function moondew(): ForestModel {
  const plant: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) plant.push(leaf((i / 9) * Math.PI * 2 + 0.3, 0.42, 0.07, 0.75 + (i % 3) * 0.12, c('#2f6a48'), c('#86c99a')));
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const stems = [
    { a: 0.2, r: 0.06, h: 0.62 },
    { a: 2.3, r: 0.08, h: 0.54 },
    { a: 4.2, r: 0.05, h: 0.7 },
  ];
  for (const s of stems) {
    const x = Math.cos(s.a) * s.r;
    const z = Math.sin(s.a) * s.r;
    solid.push(cylinder(0.012, 0.018, s.h, [x * 0.3, 0, z * 0.3], c('#3f7f5a'), 5, [Math.sin(s.a) * 0.15, 0, -Math.cos(s.a) * 0.15]));
    // 鈴形花：開口朝下的小圓錐
    const bell = new THREE.ConeGeometry(0.06, 0.09, 7, 1, true);
    bell.rotateX(Math.PI);
    bell.translate(x, s.h, z);
    glow.push(paint(bell, glowColor('#dff1ff', 1.25)));
    glow.push(sphere(0.022, [x, s.h - 0.05, z], glowColor('#bfe6ff', 1.9), [1, 1, 1], 0));
  }
  return { plant: merge(plant, '月露草葉'), solid: merge(solid, '月露草莖'), glow: merge(glow, '月露草花') };
}

/** 發光蘑菇叢（小型地面菌）：奶油色菌柄、薄荷色會發光的小菌傘 */
function glowMushrooms(): ForestModel {
  const rand = mulberry32(813);
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand();
    const r = i === 0 ? 0 : 0.12 + rand() * 0.14;
    const h = (i === 0 ? 0.34 : 0.14 + rand() * 0.14) * 1.1;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    solid.push(cylinder(0.025, 0.035, h, [x, 0, z], c('#efe3c8'), 6));
    const cap = new THREE.SphereGeometry(0.06 + h * 0.18, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.62, 1);
    cap.translate(x, h, z);
    glow.push(paint(cap, glowColor(i % 2 === 0 ? MINT : '#9fe9ff', 1.3 + rand() * 0.4)));
  }
  return { solid: merge(solid, '發光蘑菇柄'), glow: merge(glow, '發光蘑菇傘') };
}

/** 樹根拱門（`tree_glowmoss_root_arch`）：幾條粗樹根交纏成拱，跨在小徑上；寬約 5.2 m、高約 4.4 m，沿 X 軸跨過 */
function rootArch(): ForestModel {
  const rand = mulberry32(814);
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const zo = (k - 1) * 0.42;
    const w = 2.7 + k * 0.15;
    const h = 4.2 - k * 0.3;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const a = Math.PI * (1 - t);
      pts.push([Math.cos(a) * w + (rand() - 0.5) * 0.2, Math.sin(a) * h - 0.15, zo + Math.sin(t * Math.PI * 3 + k) * 0.18]);
    }
    solid.push(root(pts, 0.36 - k * 0.06, k === 1 ? BARK : BARK_DARK, 0.85, 26));
  }
  // 拱腳的根鬚往地面散開
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rand();
      solid.push(root([[side * 2.7, 0.9, 0], [side * 2.7 + Math.cos(a) * 0.9, 0.25, Math.sin(a) * 0.9], [side * 2.7 + Math.cos(a) * 1.7, -0.1, Math.sin(a) * 1.7]], 0.2, BARK_DARK, 0.3, 8));
    }
  }
  // 拱頂的苔蘚與垂下的發光孢子
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.2 + (i / 6) * 0.6);
    const x = Math.cos(a) * 2.8;
    const y = Math.sin(a) * 4.2 + 0.1;
    solid.push(sphere(0.38 + rand() * 0.2, [x, y, (rand() - 0.5) * 0.6], i % 2 === 0 ? MOSS : MOSS_LIGHT, [1.3, 0.55, 1.1]));
    if (i % 2 === 1) glow.push(sphere(0.07, [x, y - 0.55 - rand() * 0.4, (rand() - 0.5) * 0.5], glowColor(MINT, 1.8), [1, 1.3, 1], 0));
  }
  return { solid: merge(solid, '樹根拱門'), glow: merge(glow, '樹根拱門光點') };
}

/** 樹根牆（根鬚迷宮的通道壁）：沿 X 軸長 8 m、高約 2.4 m、厚約 1.6 m 的一團交纏樹根 */
function rootWall(): ForestModel {
  const rand = mulberry32(815);
  const solid: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const y = 0.25 + (k % 4) * 0.55 + rand() * 0.2;
    const z = (rand() - 0.5) * 0.9;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push([-4.1 + t * 8.2, y + Math.sin(t * Math.PI * 2 + k) * 0.35, z + Math.cos(t * Math.PI * 3 + k * 1.7) * 0.35]);
    }
    solid.push(root(pts, 0.32 + rand() * 0.14, k % 2 === 0 ? BARK : BARK_DARK, 0.75, 14));
  }
  for (let i = 0; i < 6; i++) solid.push(sphere(0.45 + rand() * 0.25, [-3.4 + i * 1.35, 2.3 + rand() * 0.25, (rand() - 0.5) * 0.6], i % 2 ? MOSS : MOSS_LIGHT, [1.4, 0.5, 1.1]));
  return { solid: merge(solid, '樹根牆') };
}

/** 巨大蘑菇樹（苔冠空地中央，頭目級菌樹）：粗菌柄與根腳、奶油色大菌傘、迷霧期灰紫色傘緣、傘頂的發光小花 */
function giantMushroom(): ForestModel {
  const rand = mulberry32(816);
  const solid: THREE.BufferGeometry[] = [cylinder(1.15, 1.7, 8, [0, 0, 0], c('#e9dcc0'), 12)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.3;
    solid.push(root([[Math.cos(a) * 1.2, 1.6, Math.sin(a) * 1.2], [Math.cos(a) * 2.4, 0.5, Math.sin(a) * 2.4], [Math.cos(a) * 3.6, -0.2, Math.sin(a) * 3.6]], 0.42, BARK, 0.3, 10));
  }
  // 菌傘：上半球壓扁，下方深色菌褶，邊緣一圈灰紫
  const cap = new THREE.SphereGeometry(6.2, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.48, 1);
  cap.translate(0, 7.6, 0);
  solid.push(paint(cap, c('#f3e3c3')));
  const gills = new THREE.CircleGeometry(6.15, 22);
  gills.rotateX(Math.PI / 2);
  gills.translate(0, 7.58, 0);
  solid.push(paint(gills, c('#b9a58a')));
  const rim = new THREE.TorusGeometry(6.05, 0.42, 6, 26);
  rim.rotateX(Math.PI / 2);
  rim.scale(1, 0.7, 1);
  rim.translate(0, 7.7, 0);
  solid.push(paint(rim, c('#8b8aa8')));
  // 菌傘上的斑點與苔蘚
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.5 + rand() * 3.4;
    const y = 7.6 + Math.sqrt(Math.max(0, 1 - (r / 6.2) ** 2)) * 6.2 * 0.48;
    solid.push(sphere(0.45 + rand() * 0.3, [Math.cos(a) * r, y - 0.05, Math.sin(a) * r], i % 3 === 0 ? MOSS : c('#fbf3df'), [1.2, 0.35, 1.2]));
  }
  const glow: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 3.6;
    const y = 7.6 + Math.sqrt(Math.max(0, 1 - (r / 6.2) ** 2)) * 6.2 * 0.48 + 0.12;
    glow.push(sphere(0.14 + rand() * 0.06, [Math.cos(a) * r, y, Math.sin(a) * r], glowColor(i % 2 ? MINT : '#ffe9a8', 1.7), [1, 0.7, 1], 0));
  }
  // 菌褶下垂著的孢子
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    glow.push(sphere(0.09, [Math.cos(a) * 4.6, 6.9 - (i % 3) * 0.35, Math.sin(a) * 4.6], glowColor(MINT, 1.6), [1, 1.4, 1], 0));
  }
  return { solid: merge(solid, '巨大蘑菇樹'), glow: merge(glow, '巨大蘑菇樹光點') };
}

/** 月牙樹（林地地標）：粗壯的老樹，樹冠長成一彎新月的形狀，枝頭垂著發光的苔蘚球 */
function crescentTree(): ForestModel {
  const rand = mulberry32(817);
  const solid: THREE.BufferGeometry[] = [cylinder(0.65, 1.15, 6.5, [0, 0, 0], BARK, 10)];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    solid.push(root([[Math.cos(a) * 0.8, 1.2, Math.sin(a) * 0.8], [Math.cos(a) * 1.8, 0.35, Math.sin(a) * 1.8], [Math.cos(a) * 2.7, -0.15, Math.sin(a) * 2.7]], 0.32, BARK_DARK, 0.3, 8));
  }
  // 兩根主枝撐起新月形的樹冠
  solid.push(root([[0, 5.5, 0], [-1.6, 7.2, 0.2], [-2.6, 8.8, 0]], 0.42, BARK, 0.5, 8));
  solid.push(root([[0, 5.8, 0], [1.5, 7.6, -0.2], [2.4, 9.6, 0]], 0.38, BARK, 0.5, 8));
  const glow: THREE.BufferGeometry[] = [];
  // 新月：沿 C 字形弧線排列的葉團，兩端漸細
  const arcCenter = new THREE.Vector3(0.6, 9.4, 0);
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = Math.PI * (0.55 + t * 1.25);
    const thick = Math.sin(t * Math.PI);
    const r = 3.6 - thick * 0.6;
    const x = arcCenter.x + Math.cos(a) * r;
    const y = arcCenter.y + Math.sin(a) * r * 0.85;
    const size = 0.7 + thick * 1.3;
    solid.push(sphere(size, [x, y, (rand() - 0.5) * 0.8], i % 3 === 0 ? MOSS_LIGHT : MOSS, [1, 0.85, 1.1]));
    if (i % 2 === 0) glow.push(sphere(0.12, [x + (rand() - 0.5) * 0.6, y - size * 0.9 - 0.3, (rand() - 0.5) * 0.9], glowColor(MINT, 1.8), [1, 1.3, 1], 0));
  }
  return { solid: merge(solid, '月牙樹'), glow: merge(glow, '月牙樹光點') };
}

/** 發光石環的立石：苔蘚覆頂，石面刻著一圈會發光的符紋 */
function glowStone(): ForestModel {
  const rand = mulberry32(818);
  const body = new THREE.DodecahedronGeometry(0.6, 0);
  body.scale(0.85, 2.0, 0.65);
  body.translate(0, 1.15, 0);
  const solid = [paint(body, c('#8e8f96')), sphere(0.42, [0, 2.25, 0], MOSS_LIGHT, [1.2, 0.45, 1])];
  const glow: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const y = 0.7 + i * 0.32;
    const g = new THREE.BoxGeometry(0.16 - (i % 2) * 0.05, 0.07, 0.04);
    g.translate((rand() - 0.5) * 0.15, y, 0.4);
    glow.push(paint(g, glowColor(MINT, 1.7)));
  }
  return { solid: merge(solid, '發光立石'), glow: merge(glow, '立石符紋') };
}

/** 古水渠閘門（`prop_forest_watergate`）：兩根石柱、橫樑與卡住的木閘板（乾涸期：閘板歪斜、纏著樹根）；沿 X 軸跨過渠道 */
/** 古水渠閘門：兩根石柱與橫樑、中間五片木閘板；open 時閘板拉起到橫樑下（任務 8C） */
function waterGate(open = false): ForestModel {
  const stone = c('#9a9a92');
  const wood = c('#8a5a33');
  const solid = [
    cylinder(0.32, 0.38, 2.6, [-2.9, -0.4, 0], stone, 8),
    cylinder(0.32, 0.38, 2.6, [2.9, -0.4, 0], stone, 8),
    cylinder(0.2, 0.2, 6.2, [-3.1, 2.15, 0], stone, 8, [0, 0, -Math.PI / 2]),
  ];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.BoxGeometry(1.15, 1.6, 0.14);
    g.rotateZ((open ? 0 : 1) * (i - 2) * 0.06);
    g.translate(-2.3 + i * 1.15, open ? 1.78 : 0.45 - Math.abs(i - 2) * 0.12, 0);
    solid.push(paint(g, i % 2 ? wood : c('#a06a3d')));
  }
  if (open) {
    // 拉起閘板的鏈條與轉輪
    for (const x of [-1.2, 1.2]) solid.push(cylinder(0.03, 0.03, 0.5, [x, 2.0, 0.12], c('#5c5a55'), 4));
    solid.push(cylinder(0.32, 0.32, 0.12, [3.25, 2.15, 0.25], c('#6b4a35'), 10, [Math.PI / 2, 0, 0]));
  } else {
    solid.push(root([[-3.2, 2.2, 0.3], [-1.4, 1.1, 0.35], [0.6, 0.6, 0.3], [2.6, 1.4, 0.32]], 0.22, BARK_DARK, 0.6, 12));
  }
  solid.push(sphere(0.5, [2.9, 2.3, 0], MOSS, [1, 0.45, 1]));
  return { solid: merge(solid, open ? '水渠閘門（打開）' : '水渠閘門') };
}

/** 林道入口（兩張地圖之間的出入口）：兩根纏著樹根的木柱、橫樑上掛著路牌與發光苔蘚燈；寬 4.4 m，沿 X 軸 */
function forestGate(): ForestModel {
  const wood = c('#7a5032');
  const solid = [
    cylinder(0.24, 0.3, 4.1, [-2.2, 0, 0], wood, 8),
    cylinder(0.24, 0.3, 4.1, [2.2, 0, 0], wood, 8),
    cylinder(0.18, 0.18, 5.4, [-2.7, 3.9, 0], BARK, 8, [0, 0, -Math.PI / 2]),
  ];
  for (const side of [-1, 1]) {
    solid.push(root([[side * 2.2, 0, 0.3], [side * 2.4, 1.4, -0.2], [side * 2.05, 2.7, 0.25], [side * 2.3, 3.9, -0.1]], 0.12, BARK_DARK, 0.7, 14));
    solid.push(sphere(0.38, [side * 2.2, 4.12, 0], MOSS, [1.3, 0.5, 1.1]));
  }
  const sign = new THREE.BoxGeometry(1.7, 0.55, 0.08);
  sign.translate(0, 3.25, 0.05);
  solid.push(paint(sign, c('#b8834c')));
  solid.push(cylinder(0.015, 0.015, 0.35, [-0.6, 3.5, 0.05], c('#5a3a22'), 4), cylinder(0.015, 0.015, 0.35, [0.6, 3.5, 0.05], c('#5a3a22'), 4));
  const glow: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    solid.push(cylinder(0.01, 0.01, 0.5, [side * 1.4, 3.4, 0], c('#5a3a22'), 4));
    glow.push(sphere(0.16, [side * 1.4, 3.32, 0], glowColor(MINT, 1.9), [1, 1.2, 1], 1));
  }
  return { solid: merge(solid, '林道入口'), glow: merge(glow, '林道入口燈') };
}


// ── 任務 8C：琳娜的路燈與奇奇的水道（Bible §6.4、§6.7 prop_forest_waterwheel / watergate） ──

/** 林間路燈：木柱、彎出的橫桿掛著一盞小燈籠；lit 時燈裡的螢苔發光（+Z 面朝向小徑） */
function trailLantern(lit: boolean): ForestModel {
  const wood = c('#6e4a2f');
  const solid = [
    cylinder(0.09, 0.12, 2.2, [0, 0, 0], wood, 7),
    cylinder(0.05, 0.05, 0.75, [0, 2.05, 0], wood, 5, [Math.PI / 2, 0, 0]),
    cylinder(0.012, 0.012, 0.22, [0, 1.84, 0.68], c('#4a3524'), 4),
  ];
  // 燈籠：上下兩片木蓋、四根細柱
  solid.push(cylinder(0.17, 0.2, 0.07, [0, 1.8, 0.68], wood, 6), cylinder(0.2, 0.16, 0.06, [0, 1.42, 0.68], wood, 6));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    solid.push(cylinder(0.014, 0.014, 0.32, [Math.cos(a) * 0.15, 1.48, 0.68 + Math.sin(a) * 0.15], wood, 4));
  }
  solid.push(sphere(0.28, [0, 0.05, 0], MOSS, [1.3, 0.35, 1.2]));
  if (!lit) {
    solid.push(sphere(0.1, [0, 1.58, 0.68], c('#7c7f74'), [1, 0.8, 1], 0));
    return { solid: merge(solid, '林間路燈') };
  }
  const glow = [sphere(0.15, [0, 1.6, 0.68], glowColor(MINT, 2.6), [1, 1.1, 1], 1)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    glow.push(sphere(0.035, [Math.cos(a) * 0.32, 0.12, Math.sin(a) * 0.32], glowColor(MINT, 1.6), [1, 1, 1], 0));
  }
  return { solid: merge(solid, '林間路燈'), glow: merge(glow, '林間路燈光') };
}

/** 崩塌的渠段（原點在渠底中央，X 橫跨渠道）：broken 時東側渠壁塌成碎石、木襯板斷裂；修好後兩側整齊的石塊與木襯板 */
function channelBreach(fixed: boolean): ForestModel {
  const rand = mulberry32(816);
  const stone = c('#8f8e86');
  const wood = c('#8a5a33');
  const solid: THREE.BufferGeometry[] = [];
  if (fixed) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const g = new THREE.BoxGeometry(0.55, 0.9, 1.05);
        g.translate(side * 2.35, 0.45, -2.1 + k * 1.05);
        solid.push(paint(g, stone, 0.12, rand));
      }
      const plank = new THREE.BoxGeometry(0.08, 0.5, 5.2);
      plank.translate(side * 2.04, 0.55, 0);
      solid.push(paint(plank, wood));
    }
    // 新補上的苔蘚與一根釘牢的橫木
    solid.push(cylinder(0.08, 0.08, 4.8, [-2.4, 0.95, 0.9], c('#7a5032'), 6, [0, 0, -Math.PI / 2]));
    solid.push(sphere(0.3, [2.4, 0.95, -1.4], MOSS, [1.4, 0.4, 1.2]));
    return { solid: merge(solid, '修好的渠段') };
  }
  // 西側還在的渠壁
  for (let k = 0; k < 5; k++) {
    const g = new THREE.BoxGeometry(0.55, 0.9, 1.05);
    g.translate(-2.35, 0.45, -2.1 + k * 1.05);
    solid.push(paint(g, stone, 0.12, rand));
  }
  // 東側塌下來的碎石與斷掉的木板
  for (let k = 0; k < 9; k++) {
    solid.push(sphere(0.22 + rand() * 0.22, [1.2 + rand() * 1.4, 0.12, -2.2 + rand() * 4.4], stone.clone().multiplyScalar(0.85 + rand() * 0.2), [1.2, 0.7, 1], 0));
  }
  for (let k = 0; k < 3; k++) {
    const plank = new THREE.BoxGeometry(0.08, 0.45, 1.4);
    plank.rotateX(0.4 - k * 0.35);
    plank.rotateZ(0.5 + k * 0.2);
    plank.translate(1.7 + k * 0.25, 0.25, -1.4 + k * 1.3);
    solid.push(paint(plank, wood.clone().multiplyScalar(0.8)));
  }
  // 渠水從缺口滲走留下的濕泥
  solid.push(paint(new THREE.CylinderGeometry(1.4, 1.5, 0.04, 12).translate(1.6, 0.02, 0), c('#3d3229')));
  return { solid: merge(solid, '崩塌的渠段') };
}

/** 分水木輪的骨架（原點在渠底中央，X 橫跨渠道）：兩根石柱、輪軸、頂上的平台；高約 6 m */
function waterWheelFrame(): ForestModel {
  const stone = c('#8f8e86');
  const wood = c('#7a5032');
  const solid: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const pillar = new THREE.BoxGeometry(0.9, 6.2, 0.9);
    pillar.translate(side * 1.0, 3.1, 0);
    solid.push(paint(pillar, stone));
    solid.push(sphere(0.38, [side * 1.0, 6.25, 0.3], MOSS, [1.2, 0.4, 1]));
  }
  solid.push(cylinder(0.12, 0.12, 2.6, [-1.3, 2.9, 0], c('#5c5a55'), 8, [0, 0, -Math.PI / 2]));
  const deck = new THREE.BoxGeometry(2.9, 0.18, 1.6);
  deck.translate(0, 6.25, 0);
  solid.push(paint(deck, wood));
  return { solid: merge(solid, '分水木輪骨架') };
}

/** 汲水輪（繞局部 X 軸轉動；中心在原點）：半徑 2.5 m，外圈 12 個水斗 */
function waterWheelRotor(): ForestModel {
  const wood = c('#8a5a33');
  const dark = c('#5f3d24');
  const solid: THREE.BufferGeometry[] = [];
  for (const x of [-0.42, 0.42]) {
    const ring = new THREE.TorusGeometry(2.4, 0.08, 6, 28);
    ring.rotateY(Math.PI / 2);
    ring.translate(x, 0, 0);
    solid.push(paint(ring, dark));
  }
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.BoxGeometry(0.1, 4.8, 0.12);
    spoke.rotateX((i / 6) * Math.PI);
    solid.push(paint(spoke, wood));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bucket = new THREE.BoxGeometry(0.95, 0.32, 0.42);
    bucket.rotateX(a);
    bucket.translate(0, Math.sin(a) * 2.45, Math.cos(a) * 2.45);
    solid.push(paint(bucket, i % 2 ? wood : c('#a06a3d')));
  }
  solid.push(cylinder(0.3, 0.3, 1.0, [-0.5, 0, 0], dark, 10, [0, 0, -Math.PI / 2]));
  return { solid: merge(solid, '汲水輪') };
}

/** 分水盆（繞 Y 軸轉動）：圓木盆與朝 +Z 伸出的出水口 */
function waterWheelSpout(): ForestModel {
  const wood = c('#8a5a33');
  const solid = [cylinder(0.72, 0.6, 0.5, [0, 0, 0], wood, 12), cylinder(0.08, 0.08, 0.5, [0, -0.5, 0], c('#5c5a55'), 6)];
  const lip = new THREE.BoxGeometry(0.42, 0.14, 1.0);
  lip.translate(0, 0.32, 0.95);
  solid.push(paint(lip, c('#a06a3d')));
  for (const x of [-0.24, 0.24]) {
    const wall = new THREE.BoxGeometry(0.06, 0.24, 1.0);
    wall.translate(x, 0.44, 0.95);
    solid.push(paint(wall, wood));
  }
  // 指向目前木槽的小旗（遠處也看得出方向）
  solid.push(cylinder(0.025, 0.025, 1.1, [0, 0.4, 1.35], c('#5a3a22'), 4));
  const flag = new THREE.BoxGeometry(0.03, 0.32, 0.45);
  flag.translate(0, 1.3, 1.6);
  solid.push(paint(flag, c('#f39a91')));
  return { solid: merge(solid, '分水盆') };
}

/** 木輪的操作桿（岸上）：木樁與一根斜伸的握把 */
function waterWheelLever(): ForestModel {
  const wood = c('#6e4a2f');
  const solid = [cylinder(0.14, 0.17, 1.0, [0, 0, 0], wood, 7), cylinder(0.04, 0.04, 0.9, [0, 0.9, 0], c('#a06a3d'), 5, [0.6, 0, 0])];
  solid.push(sphere(0.08, [0, 1.62, 0.5], c('#f39a91'), [1, 1, 1], 0));
  return { solid: merge(solid, '木輪操作桿') };
}

/** 苔蘚節點（木槽的出水處）：dry 時灰褐乾裂、捲曲的枯苔；喚醒後是飽滿的螢苔與發光小菌（+Z 面朝向木輪） */
function mossNode(awake: boolean): ForestModel {
  const rand = mulberry32(awake ? 817 : 818);
  const stone = c('#8f8e86');
  const solid: THREE.BufferGeometry[] = [];
  // 承水的石槽（木槽的水落在這裡）
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    solid.push(sphere(0.26 + rand() * 0.1, [Math.cos(a) * 0.75, 0.1, 0.9 + Math.sin(a) * 0.42], stone, [1.2, 0.6, 1], 0));
  }
  if (!awake) {
    const plant = [carpet(1.7, c('#7d7a68'), c('#5d5a4c'), rand), carpet(0.9, c('#8a8572'), c('#6c6857'), rand, 0.05)];
    for (let i = 0; i < 8; i++) plant.push(leaf((i / 8) * Math.PI * 2 + 0.2, 0.28, 0.06, 1.1, c('#6c6857'), c('#9a9480'), 0.04));
    solid.push(paint(new THREE.CylinderGeometry(0.55, 0.6, 0.03, 10).translate(0, 0.02, 0.9), c('#4a3f33')));
    return { solid: merge(solid, '乾枯的苔蘚節點'), plant: merge(plant, '乾枯的苔') };
  }
  const plant = [carpet(1.9, MOSS_LIGHT, MOSS, rand), carpet(1.1, c('#6fae7a'), MOSS_LIGHT, rand, 0.06)];
  for (let i = 0; i < 12; i++) plant.push(leaf((i / 12) * Math.PI * 2, 0.36, 0.09, 0.5, MOSS, c('#7fc49a'), 0.05));
  const glow: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 1.5;
    glow.push(sphere(0.04 + rand() * 0.03, [Math.cos(a) * r, 0.1 + rand() * 0.2, Math.sin(a) * r], glowColor(MINT, 1.7 + rand() * 0.5), [1, 1, 1], 0));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    const x = Math.cos(a) * 1.2;
    const z = Math.sin(a) * 1.2;
    solid.push(cylinder(0.03, 0.04, 0.26, [x, 0, z], c('#efe3c8'), 6));
    const cap = new THREE.SphereGeometry(0.11, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.62, 1);
    cap.translate(x, 0.26, z);
    glow.push(paint(cap, glowColor(i % 2 ? MINT : '#9fe9ff', 1.5)));
  }
  solid.push(paint(new THREE.CylinderGeometry(0.55, 0.6, 0.03, 10).translate(0, 0.04, 0.9), c('#77c9df')));
  return { solid: merge(solid, '苔蘚節點'), plant: merge(plant, '甦醒的苔'), glow: merge(glow, '苔蘚節點光點') };
}

/**
 * 苔冠空地邊緣的水槽（任務 8D，Bible §6.5）：石槽 2.4 × 1.2 m（沿 X），+Z 面向菌樹；
 * 背面（−Z）有一截樹根空心木管把水接進來。乾涸時槽底是龜裂的泥、苔蘚灰灰的；注滿時水面發光、木管流下水柱、苔蘚冒出光點
 */
function crownTrough(full: boolean): ForestModel {
  const stone = c('#9a978c');
  const stoneDark = c('#7d7a70');
  const box = (size: [number, number, number], at: [number, number, number], color: THREE.Color) => {
    const g = new THREE.BoxGeometry(...size);
    g.translate(...at);
    return paint(g, color);
  };
  const solid = [
    box([2.4, 0.16, 1.2], [0, 0.08, 0], stoneDark),
    box([2.4, 0.56, 0.18], [0, 0.36, 0.51], stone),
    box([2.4, 0.56, 0.18], [0, 0.36, -0.51], stone),
    box([0.18, 0.56, 0.84], [1.11, 0.36, 0], stone),
    box([0.18, 0.56, 0.84], [-1.11, 0.36, 0], stone),
    // 空心木管：從背後斜斜伸進槽的上方
    cylinder(0.13, 0.15, 1.1, [0.3, 0.72, -1.45], BARK, 8, [Math.PI / 2 - 0.25, 0, 0]),
    root([[-0.4, 0, -1.3], [-0.1, 0.5, -1.2], [0.25, 0.8, -1.1], [0.55, 0.62, -0.9]], 0.07, BARK_DARK, 0.5, 10),
  ];
  const rand = mulberry32(full ? 41 : 40);
  const plant: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  // 四個角落的苔蘚
  for (const [x, z] of [[-1.1, 0.5], [1.1, 0.5], [-1.1, -0.5], [1.1, -0.5]] as const) {
    solid.push(sphere(0.2, [x, 0.66, z], full ? MOSS : c('#77766a'), [1.2, 0.45, 1.2]));
  }
  if (!full) {
    // 槽底龜裂的泥塊
    for (let i = 0; i < 9; i++) {
      const g = new THREE.CylinderGeometry(0.2 + rand() * 0.1, 0.22 + rand() * 0.1, 0.04, 6);
      g.translate(-0.8 + (i % 5) * 0.4 + rand() * 0.08, 0.18, i < 5 ? -0.17 : 0.18);
      solid.push(paint(g, i % 2 ? c('#7a6a55') : c('#6c5d4a')));
    }
    for (let i = 0; i < 6; i++) plant.push(leaf((i / 6) * Math.PI * 2, 0.22, 0.05, 1.1, c('#6c6857'), c('#9a9480'), 0.68).translate(i % 2 ? 1.1 : -1.1, 0, i < 3 ? 0.5 : -0.5));
    return { solid: merge(solid, '乾涸的水槽'), plant: merge(plant, '乾枯的苔') };
  }
  glow.push(box([2.04, 0.04, 0.84], [0, 0.52, 0], glowColor('#77c9df', 1.25)));
  // 木管流下的水柱
  glow.push(box([0.12, 0.42, 0.1], [0.3, 0.72, -0.4], glowColor('#9fe9ff', 1.4)));
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    glow.push(sphere(0.035 + rand() * 0.02, [Math.cos(a) * 0.9, 0.58 + rand() * 0.25, Math.sin(a) * 0.35], glowColor(MINT, 1.8), [1, 1, 1], 0));
  }
  for (let i = 0; i < 8; i++) plant.push(leaf((i / 8) * Math.PI * 2 + 0.3, 0.3, 0.07, 0.6, MOSS, c('#7fc49a'), 0.68).translate(i % 2 ? 1.1 : -1.1, 0, i < 4 ? 0.5 : -0.5));
  return { solid: merge(solid, '注滿的水槽'), plant: merge(plant, '甦醒的苔'), glow: merge(glow, '水槽的水光') };
}

/**
 * 森林根源石（`prop_forest_root_stone`，任務 8D-2）：半人高的圓頂石，被樹根環抱，正面刻著一株嫩芽。
 * 沉睡時石面灰暗、苔蘚枯黃、刻紋沒有光；喚醒後刻紋與根縫發出螢光薄荷色，周圍冒出新芽與光點（芽之共鳴）。
 */
function rootStone(awake: boolean): ForestModel {
  const rand = mulberry32(awake ? 43 : 42);
  const body = new THREE.DodecahedronGeometry(0.75, 1);
  body.scale(1.05, 1.45, 0.8);
  body.translate(0, 1.0, 0);
  const solid: THREE.BufferGeometry[] = [paint(body, awake ? c('#8d978f') : c('#80807c'), 0.06, rand), cylinder(1.25, 1.45, 0.3, [0, 0, 0], c('#6f6e66'), 10)];
  // 環抱的樹根：從地面繞上石頭側面
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5;
    const r0 = 1.9;
    solid.push(
      root(
        [
          [Math.cos(a) * r0, -0.1, Math.sin(a) * r0],
          [Math.cos(a) * 1.15, 0.45, Math.sin(a) * 0.95],
          [Math.cos(a + 0.5) * 0.82, 1.2 + (i % 2) * 0.3, Math.sin(a + 0.5) * 0.62],
          [Math.cos(a + 0.9) * 0.55, 1.75 + (i % 2) * 0.2, Math.sin(a + 0.9) * 0.42],
        ],
        0.16,
        i % 2 ? BARK : BARK_DARK,
        0.35,
        14,
      ),
    );
  }
  // 頂上的苔蘚
  solid.push(sphere(0.5, [0, 2.05, 0], awake ? MOSS_LIGHT : c('#8a8566'), [1.3, 0.38, 1.1]));
  // 正面（+Z）的嫩芽刻紋：莖與兩片葉
  const carve: THREE.BufferGeometry[] = [];
  const rune = awake ? glowColor(MINT, 2.4) : c('#5b5c58');
  const stem = new THREE.BoxGeometry(0.07, 0.62, 0.05);
  stem.translate(0, 1.0, 0.63);
  carve.push(paint(stem, rune));
  for (const side of [-1, 1]) {
    const leafG = new THREE.SphereGeometry(0.16, 8, 6);
    leafG.scale(1.4, 0.55, 0.3);
    leafG.rotateZ(side * 0.5);
    leafG.translate(side * 0.17, 1.3, 0.62);
    carve.push(paint(leafG, rune));
  }
  const seed = new THREE.SphereGeometry(0.11, 8, 6);
  seed.scale(1.2, 0.8, 0.4);
  seed.translate(0, 0.66, 0.64);
  carve.push(paint(seed, rune));
  const plant: THREE.BufferGeometry[] = [];
  if (!awake) {
    solid.push(...carve);
    for (let i = 0; i < 7; i++) plant.push(leaf((i / 7) * Math.PI * 2, 0.4, 0.08, 0.5, c('#7d7860'), c('#a39d80')).translate(Math.cos(i) * 1.3, 0.12, Math.sin(i) * 1.3));
    return { solid: merge(solid, '沉睡的根源石'), plant: merge(plant, '枯黃的苔') };
  }
  const glow = carve;
  // 根縫的光與周圍浮起的光點
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.1 + rand() * 1.0;
    glow.push(sphere(0.04 + rand() * 0.03, [Math.cos(a) * r, 0.25 + rand() * 1.9, Math.sin(a) * r], glowColor(MINT, 1.9), [1, 1, 1], 0));
  }
  // 冒出來的新芽
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
    const r = 1.35 + rand() * 0.5;
    for (let k = 0; k < 3; k++) plant.push(leaf((k / 3) * Math.PI * 2 + a, 0.32, 0.09, 0.95, MOSS, c('#9fe0b0')).translate(Math.cos(a) * r, 0.1, Math.sin(a) * r));
  }
  return { solid: merge(solid, '甦醒的根源石'), plant: merge(plant, '新芽'), glow: merge(glow, '芽之共鳴的光') };
}

export const forestBuilders: Record<string, () => ForestModel> = {
  glowmoss_patch: glowmossPatch,
  glowmoss_tuft: glowmossTuft,
  moondew: moondew,
  glow_mushrooms: glowMushrooms,
  root_arch: rootArch,
  root_wall: rootWall,
  giant_mushroom: giantMushroom,
  crescent_tree: crescentTree,
  glow_stone: glowStone,
  water_gate: () => waterGate(false),
  water_gate_open: () => waterGate(true),
  forest_gate: forestGate,
  trail_lantern: () => trailLantern(false),
  trail_lantern_lit: () => trailLantern(true),
  channel_breach: () => channelBreach(false),
  channel_breach_fixed: () => channelBreach(true),
  water_wheel_frame: waterWheelFrame,
  water_wheel_rotor: waterWheelRotor,
  water_wheel_spout: waterWheelSpout,
  water_wheel_lever: waterWheelLever,
  moss_node_dry: () => mossNode(false),
  moss_node: () => mossNode(true),
  crown_trough: () => crownTrough(false),
  crown_trough_full: () => crownTrough(true),
  root_stone: () => rootStone(false),
  root_stone_awake: () => rootStone(true),
};
