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
const glowColor = (hex: string, power: number) => new THREE.Color(hex).multiplyScalar(power);

const MOSS = c('#386b53');
const MOSS_LIGHT = c('#5f9a6a');
const BARK = c('#6b4a35');
const BARK_DARK = c('#4c3426');
const MINT = '#8de6be';

function paint(g: THREE.BufferGeometry, color: THREE.Color, jitter = 0, rand?: () => number): THREE.BufferGeometry {
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

function merge(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
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

function sphere(radius: number, at: [number, number, number], color: THREE.Color, squash: [number, number, number] = [1, 1, 1], detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  g.scale(...squash);
  g.translate(...at);
  return paint(g, color);
}

function cylinder(rTop: number, rBottom: number, height: number, at: [number, number, number], color: THREE.Color, segments = 8, rot: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
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
function leaf(angle: number, length: number, width: number, tilt: number, base: THREE.Color, tip: THREE.Color, y = 0): THREE.BufferGeometry {
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
function waterGate(): ForestModel {
  const stone = c('#9a9a92');
  const wood = c('#8a5a33');
  const solid = [
    cylinder(0.32, 0.38, 2.6, [-2.9, -0.4, 0], stone, 8),
    cylinder(0.32, 0.38, 2.6, [2.9, -0.4, 0], stone, 8),
    cylinder(0.2, 0.2, 6.2, [-3.1, 2.15, 0], stone, 8, [0, 0, -Math.PI / 2]),
  ];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.BoxGeometry(1.15, 1.6, 0.14);
    g.rotateZ((i - 2) * 0.06);
    g.translate(-2.3 + i * 1.15, 0.45 - Math.abs(i - 2) * 0.12, 0);
    solid.push(paint(g, i % 2 ? wood : c('#a06a3d')));
  }
  solid.push(root([[-3.2, 2.2, 0.3], [-1.4, 1.1, 0.35], [0.6, 0.6, 0.3], [2.6, 1.4, 0.32]], 0.22, BARK_DARK, 0.6, 12));
  solid.push(sphere(0.5, [2.9, 2.3, 0], MOSS, [1, 0.45, 1]));
  return { solid: merge(solid, '水渠閘門') };
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
  water_gate: waterGate,
  forest_gate: forestGate,
};
