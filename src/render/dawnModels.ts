import * as THREE from 'three';
import { mulberry32 } from '@/game-core/util/random';
import { cylinder, glowColor, leaf, merge, paint, sphere, type ForestModel } from './forestModels';

/**
 * 晨曦燈塔任務（任務 7D，Bible §5.4 quest_dawn_003、§5.6）的程式模型：燈罩碎片、迷霧核心、燈塔頂的燈籠室。
 * 與螢苔祕林的程式模型相同，分成 solid / plant / glow 三種部件。
 */
const c = (hex: string) => new THREE.Color(hex);
const GOLD = '#ffd77a';

/** 燈罩碎片（`item_lantern_shard` 的拾取點）：一片彎曲的金色玻璃斜插在草裡，旁邊幾顆金色光點（Bible §5.8：少量金色螢光點） */
function lanternShard(): ForestModel {
  const rand = mulberry32(71);
  const pane = new THREE.CylinderGeometry(0.42, 0.42, 0.5, 10, 1, true, 0, Math.PI * 0.55);
  pane.rotateZ(0.45);
  pane.rotateY(0.6);
  pane.translate(0.1, 0.28, 0);
  const rim = new THREE.TorusGeometry(0.42, 0.03, 5, 12, Math.PI * 0.55);
  rim.rotateX(Math.PI / 2);
  rim.rotateZ(0.45);
  rim.rotateY(0.6);
  rim.translate(0.1, 0.52, 0);
  const solid = [paint(rim, c('#9b7a3c')), sphere(0.16, [-0.12, 0.04, 0.1], c('#7b7466'), [1.4, 0.5, 1.1])];
  const glow = [paint(pane, glowColor(GOLD, 1.5))];
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.35 + rand() * 0.4;
    glow.push(sphere(0.03, [Math.cos(a) * r, 0.15 + rand() * 0.6, Math.sin(a) * r], glowColor(GOLD, 2.2), [1, 1, 1], 0));
  }
  return { solid: merge(solid, '燈罩碎片的框'), glow: merge(glow, '燈罩碎片') };
}

/**
 * 迷霧核心（任務 7D）：從龜裂地面長出來的灰紫色晶簇，周圍纏著霧團。
 * 淨化後晶簇縮小、變成淡金白色並微微發光，裂縫裡冒出新草。
 */
function mistCore(clear: boolean): ForestModel {
  const rand = mulberry32(clear ? 73 : 72);
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const plant: THREE.BufferGeometry[] = [];
  // 龜裂的地面
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.4;
    const g = new THREE.CylinderGeometry(0.5 + rand() * 0.25, 0.55 + rand() * 0.25, 0.12, 6);
    g.translate(Math.cos(a) * 1.25, 0.04, Math.sin(a) * 1.25);
    solid.push(paint(g, clear ? c('#8b7d64') : c('#5e5566')));
  }
  // 晶簇：中央一根高的，周圍斜插幾根
  const crystal = (h: number, r: number, at: [number, number, number], tilt: [number, number], color: THREE.Color) => {
    const g = new THREE.OctahedronGeometry(r, 0);
    g.scale(1, h / r / 2, 1);
    g.translate(0, h / 2, 0);
    g.rotateX(tilt[0]);
    g.rotateZ(tilt[1]);
    g.translate(...at);
    return paint(g, color);
  };
  const scale = clear ? 0.55 : 1;
  const tall = crystal(2.2 * scale, 0.42 * scale, [0, 0, 0], [0, 0], clear ? glowColor('#fff1c8', 1.4) : c('#6d5a8e'));
  (clear ? glow : solid).push(tall);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const h = (0.8 + rand() * 0.7) * scale;
    const piece = crystal(h, 0.22 * scale, [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [Math.sin(a) * 0.5, -Math.cos(a) * 0.5], clear ? glowColor(GOLD, 1.25) : i % 2 ? c('#4f4466') : c('#7b6a9a'));
    (clear ? glow : solid).push(piece);
  }
  if (!clear) {
    // 晶簇裡不穩定的紫光，以及纏繞的霧團
    glow.push(sphere(0.18, [0, 1.0, 0], glowColor('#b58cff', 1.6), [1, 1.4, 1], 1));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 0.9 + rand() * 0.4;
      solid.push(sphere(0.32 + rand() * 0.18, [Math.cos(a) * r, 0.5 + rand() * 1.2, Math.sin(a) * r], c('#a99bc4'), [1.3, 0.8, 1.1]));
    }
    return { solid: merge(solid, '迷霧核心'), glow: merge(glow, '迷霧核心的紫光') };
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rand() * 0.3;
    const r = 0.9 + rand() * 0.8;
    for (let k = 0; k < 3; k++) plant.push(leaf((k / 3) * Math.PI * 2 + a, 0.3, 0.07, 1.0, c('#5c9a4a'), c('#a8d873')).translate(Math.cos(a) * r, 0.08, Math.sin(a) * r));
  }
  return { solid: merge(solid, '淨化後的地面'), plant: merge(plant, '新草'), glow: merge(glow, '淨化後的晶簇') };
}

/**
 * 晨曦燈塔頂的燈籠室（`building_dawn_lighthouse` 的啟動前後兩種狀態）：原點在塔頂。
 * 熄滅時是灰暗的空燈架與破掉的燈罩；點亮後燈罩完整、中央的燈芯發出金光（光柱另外由 LighthouseBeam 畫）。
 */
function lighthouseLamp(lit: boolean): ForestModel {
  const iron = c('#3f3a36');
  const solid: THREE.BufferGeometry[] = [cylinder(1.25, 1.35, 0.25, [0, 0, 0], c('#6f6a64'), 12), cylinder(0.15, 1.2, 0.7, [0, 1.75, 0], c('#355a86'), 12), sphere(0.16, [0, 2.5, 0], c('#d9b25a'), [1, 1, 1], 1)];
  // 六根燈架柱子
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    solid.push(cylinder(0.05, 0.05, 1.5, [Math.cos(a) * 1.05, 0.25, Math.sin(a) * 1.05], iron, 5));
  }
  solid.push(cylinder(1.12, 1.12, 0.08, [0, 1.72, 0], iron, 12));
  const glow: THREE.BufferGeometry[] = [];
  const pane = new THREE.CylinderGeometry(0.9, 0.9, 1.2, 12, 1, true);
  pane.translate(0, 0.95, 0);
  if (!lit) {
    // 破掉的燈罩：只剩一部分，顏色灰暗
    const broken = new THREE.CylinderGeometry(0.9, 0.9, 1.2, 12, 1, true, 0, Math.PI * 0.8);
    broken.translate(0, 0.95, 0);
    solid.push(paint(broken, c('#7a7f86')), sphere(0.22, [0, 0.8, 0], c('#5c5852'), [1, 1.2, 1], 1));
    return { solid: merge(solid, '熄滅的燈籠室') };
  }
  glow.push(paint(pane, glowColor('#ffe6a8', 1.3)), sphere(0.42, [0, 0.95, 0], glowColor(GOLD, 3.2), [1, 1.25, 1], 2));
  return { solid: merge(solid, '燈籠室'), glow: merge(glow, '燈塔的光') };
}

/** 星光鏡（任務 7E，Bible §5.5「星光互動物」）：木架上的圓形金框鏡子，鏡面（+Z）朝向燈塔；轉動時把燈塔的光反射到戰場裡 */
function starMirror(): ForestModel {
  const wood = c('#7a5233');
  const solid = [
    cylinder(0.5, 0.6, 0.2, [0, 0, 0], c('#7d7a72'), 8),
    cylinder(0.08, 0.1, 1.6, [0, 0.2, 0], wood, 6),
    cylinder(0.05, 0.05, 1.3, [0, 1.75, 0], wood, 5, [0, 0, Math.PI / 2]),
  ];
  const frame = new THREE.TorusGeometry(0.62, 0.07, 6, 24);
  frame.translate(0, 1.75, 0.02);
  solid.push(paint(frame, c('#c9993f')));
  const glass = new THREE.CircleGeometry(0.58, 24);
  glass.translate(0, 1.75, 0.04);
  const back = new THREE.CircleGeometry(0.58, 24);
  back.rotateY(Math.PI);
  back.translate(0, 1.75, 0);
  solid.push(paint(back, c('#5b4a36')));
  const glow = [paint(glass, glowColor('#fff4d6', 1.25)), sphere(0.06, [0, 2.45, 0.02], glowColor(GOLD, 2.2), [1, 1, 1], 0)];
  return { solid: merge(solid, '星光鏡'), glow: merge(glow, '星光鏡的鏡面') };
}

/** 乾布（任務 7G）：小竹籃裡疊著兩塊摺好的布 */
function dryCloth(): ForestModel {
  const basket = cylinder(0.32, 0.26, 0.22, [0, 0, 0], c('#b08850'), 10);
  const rim = new THREE.TorusGeometry(0.32, 0.025, 5, 16);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, 0.22, 0);
  const cloth = (color: string, y: number, yaw: number) => {
    const g = new THREE.BoxGeometry(0.42, 0.07, 0.3);
    g.rotateY(yaw);
    g.translate(0, y, 0);
    return paint(g, c(color));
  };
  return { solid: merge([basket, paint(rim, c('#8a6a3a')), cloth('#f4efe2', 0.25, 0.1), cloth('#a9cfe0', 0.32, -0.25)], '乾布') };
}

/**
 * 花圃（任務 7K，Bible §22.1 quest_dawn_005）：木框圍起來的一小塊鬆土（模型 1 單位約 1 m，建造時再縮放）。
 * 階段 0 剛種下（土裡冒出一點綠）、1 長出葉子與花苞、2 開滿野花。
 */
function gardenPlot(stage: 0 | 1 | 2): ForestModel {
  const rand = mulberry32(80 + stage);
  const wood = c('#8a5a33');
  const solid: THREE.BufferGeometry[] = [];
  for (const [sx, sz, w, d] of [[0, 0.45, 1.0, 0.1], [0, -0.45, 1.0, 0.1], [0.45, 0, 0.1, 0.8], [-0.45, 0, 0.1, 0.8]] as const) {
    const g = new THREE.BoxGeometry(w, 0.16, d);
    g.translate(sx, 0.08, sz);
    solid.push(paint(g, wood, 0.08, rand));
  }
  const soil = new THREE.BoxGeometry(0.82, 0.1, 0.82);
  soil.translate(0, 0.07, 0);
  solid.push(paint(soil, c('#6b4a33')));
  for (let i = 0; i < 8; i++) solid.push(sphere(0.05, [(rand() - 0.5) * 0.7, 0.13, (rand() - 0.5) * 0.7], c('#5a3d29'), [1.3, 0.5, 1.2], 0));
  const plant: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const spots = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0, 0]] as const;
  spots.forEach(([x, z], i) => {
    const h = stage === 0 ? 0.08 : stage === 1 ? 0.22 : 0.32;
    const leaves = stage === 0 ? 2 : 4;
    for (let k = 0; k < leaves; k++) plant.push(leaf((k / leaves) * Math.PI * 2 + i, stage === 0 ? 0.07 : 0.14, 0.04, 0.9, c('#4f8a3a'), c('#9fd06a'), 0.11).translate(x, 0, z));
    if (stage >= 1) {
      const stem = cylinder(0.008, 0.012, h, [x, 0.11, z], c('#4f8a3a'), 4);
      solid.push(stem);
      const colors = ['#f2a7c8', '#ffd86b', '#b9a2e6', '#ffffff', '#f6b16b'];
      if (stage === 1) solid.push(sphere(0.035, [x, 0.11 + h, z], c('#8fc06a'), [1, 1.3, 1], 0));
      else {
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          solid.push(sphere(0.045, [x + Math.cos(a) * 0.05, 0.11 + h, z + Math.sin(a) * 0.05], c(colors[i % colors.length]!), [1, 0.4, 1], 0));
        }
        glow.push(sphere(0.025, [x, 0.12 + h, z], glowColor('#fff2a0', 1.3), [1, 1, 1], 0));
      }
    }
  });
  return { solid: merge(solid, '花圃'), plant: merge(plant, '花圃的葉子'), ...(glow.length ? { glow: merge(glow, '花心') } : {}) };
}

/** 鬆土（任務 7K）：田邊翻鬆的一小堆土，插著一把小鏟子 */
function soilMound(): ForestModel {
  const rand = mulberry32(84);
  const solid = [sphere(0.42, [0, 0.02, 0], c('#6b4a33'), [1.2, 0.38, 1], 1)];
  for (let i = 0; i < 6; i++) solid.push(sphere(0.08, [(rand() - 0.5) * 0.8, 0.12, (rand() - 0.5) * 0.7], c('#7d5a3d'), [1.2, 0.6, 1], 0));
  solid.push(cylinder(0.02, 0.02, 0.45, [0.18, 0.15, 0.05], c('#8a5a33'), 5, [0, 0, -0.4]));
  const blade = new THREE.BoxGeometry(0.12, 0.16, 0.02);
  blade.rotateZ(-0.4);
  blade.translate(0.12, 0.12, 0.05);
  solid.push(paint(blade, c('#9a9a9a')));
  return { solid: merge(solid, '鬆土') };
}

/** 河邊的腳印（任務 7L）：泥地上一串小小的四瓣腳印，旁邊一顆被咬過的蘋果 */
function footprints(): ForestModel {
  const mud = c('#5a4532');
  const solid: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const x = (i % 2 ? 0.12 : -0.12) + i * 0.02;
    const z = -0.9 + i * 0.36;
    for (const [dx, dz, r] of [[0, 0, 0.06], [-0.06, 0.08, 0.03], [0.06, 0.08, 0.03], [0, 0.1, 0.03]] as const) {
      const g = new THREE.CylinderGeometry(r, r, 0.012, 8);
      g.translate(x + dx, 0.012, z + dz);
      solid.push(paint(g, mud));
    }
  }
  // 草叢比腳印高：被咬過的蘋果放在一塊平石頭上，旁邊幾顆淡淡的光點提示（與燈罩碎片相同的做法）
  solid.push(sphere(0.22, [0.35, 0.06, 0.5], c('#8f8e86'), [1.3, 0.45, 1.1], 1));
  solid.push(sphere(0.14, [0.35, 0.28, 0.5], c('#c8483a'), [1, 0.95, 1], 1));
  // 咬掉的一口（淡黃色的果肉）
  solid.push(sphere(0.075, [0.24, 0.31, 0.46], c('#f3e2a8'), [0.6, 1, 1], 0));
  solid.push(cylinder(0.01, 0.01, 0.08, [0.35, 0.41, 0.5], c('#5a3d29'), 4));
  const rand = mulberry32(95);
  const glow: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) glow.push(sphere(0.03, [(rand() - 0.5) * 0.8, 0.35 + rand() * 0.35, -0.6 + rand() * 1.4], glowColor(GOLD, 2), [1, 1, 1], 0));
  return { solid: merge(solid, '腳印與蘋果'), glow: merge(glow, '腳印旁的光點') };
}

/** 野果叢（任務 7L）：圓圓的矮灌木，結滿紅色小果；摘完只剩葉子 */
function berryBush(picked: boolean): ForestModel {
  const rand = mulberry32(picked ? 91 : 90);
  const solid = [sphere(0.5, [0, 0.42, 0], c('#3f7a3a'), [1.2, 0.85, 1.1], 1), sphere(0.36, [0.3, 0.36, 0.2], c('#4f8a42'), [1, 0.8, 1], 1), sphere(0.34, [-0.32, 0.34, -0.15], c('#467f3e'), [1, 0.8, 1], 1)];
  if (!picked) for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.25 + rand() * 0.5;
    solid.push(sphere(0.05, [Math.cos(a) * 0.55, y, Math.sin(a) * 0.5], c(i % 3 ? '#d23a4a' : '#8e2a6a'), [1, 1, 1], 0));
  }
  return { solid: merge(solid, '野果叢') };
}

/** 草叢裡的小窩（任務 7L）：樹根下用乾草圍成的窩；放了野果之後裡面多兩顆果子 */
function riverNest(fed: boolean): ForestModel {
  const rand = mulberry32(92);
  const solid: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4);
    g.rotateZ(Math.PI / 2);
    g.rotateY(a + 0.5);
    g.translate(Math.cos(a) * 0.32, 0.08 + (i % 3) * 0.04, Math.sin(a) * 0.32);
    solid.push(paint(g, c(i % 2 ? '#c9a66b' : '#a8844f'), 0.1, rand));
  }
  solid.push(sphere(0.3, [0, 0.03, 0], c('#8a6a42'), [1.1, 0.2, 1.1], 1));
  solid.push(cylinder(0.08, 0.12, 0.5, [-0.45, 0, -0.3], c('#6b4a35'), 6, [0.2, 0, 0.5]));
  if (fed) for (const [x, z] of [[0.06, 0.02], [-0.08, -0.04]] as const) solid.push(sphere(0.06, [x, 0.12, z], c('#d23a4a'), [1, 1, 1], 0));
  return { solid: merge(solid, '小窩') };
}

/** 草叢（任務 7L）：角兔幼崽躲著的高草叢 */
function bunnyHide(): ForestModel {
  const rand = mulberry32(93);
  const plant: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 18; i++) plant.push(leaf(rand() * Math.PI * 2, 0.5 + rand() * 0.3, 0.06, 1.25, c('#4f8a3a'), c('#b6d873')).translate((rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5));
  return { plant: merge(plant, '高草叢') };
}

/** 燈塔地窖（任務 7M）的大小：寬（X）、深（Z）、高；出口的樓梯在 +Z 那一側 */
export const CELLAR_ROOM = { width: 8, depth: 7, height: 3 } as const;

/** 燈塔地窖：石砌的圓頂小房間、潮濕的石板地、牆上兩盞燈、+Z 側往上的石階（原點在地板中央） */
function cellarRoom(): ForestModel {
  const { width: W, depth: D, height: H } = CELLAR_ROOM;
  const rand = mulberry32(100);
  const stone = c('#7d7a72');
  const solid: THREE.BufferGeometry[] = [];
  const box = (size: [number, number, number], at: [number, number, number], color: THREE.Color, jitter = 0.08) => {
    const g = new THREE.BoxGeometry(...size);
    g.translate(...at);
    solid.push(paint(g, color, jitter, rand));
  };
  // 石板地
  for (let x = -W / 2 + 0.5; x < W / 2; x += 1) for (let z = -D / 2 + 0.5; z < D / 2; z += 1) box([0.96, 0.12, 0.96], [x, -0.06, z], c('#6b6862'), 0.12);
  // 牆：一塊一塊的石磚（+Z 留出樓梯口）
  for (let y = 0.25; y < H; y += 0.5) {
    for (let x = -W / 2 + 0.5; x < W / 2; x += 1) {
      box([0.98, 0.48, 0.3], [x + (y % 1 ? 0.25 : 0) * 0, y, -D / 2 - 0.15], stone);
      if (Math.abs(x) > 1.2) box([0.98, 0.48, 0.3], [x, y, D / 2 + 0.15], stone);
    }
    for (let z = -D / 2 + 0.5; z < D / 2; z += 1) {
      box([0.3, 0.48, 0.98], [-W / 2 - 0.15, y, z], stone);
      box([0.3, 0.48, 0.98], [W / 2 + 0.15, y, z], stone);
    }
  }
  // 石磚後面的實心牆（磚縫不會透出背景）
  const backing = c('#4f4c47');
  box([W + 0.8, H + 0.4, 0.2], [0, H / 2, -D / 2 - 0.4], backing, 0);
  box([0.2, H + 0.4, D + 0.8], [-W / 2 - 0.4, H / 2, 0], backing, 0);
  box([0.2, H + 0.4, D + 0.8], [W / 2 + 0.4, H / 2, 0], backing, 0);
  for (const sx of [-1, 1]) box([W / 2 - 1.2, H + 0.4, 0.2], [sx * (W / 4 + 0.6), H / 2, D / 2 + 0.4], backing, 0);
  // 天花板與兩根拱樑
  box([W + 0.6, 0.25, D + 0.6], [0, H + 0.12, 0], c('#5f5c56'), 0.04);
  for (const z of [-1.5, 1.5]) box([W, 0.3, 0.4], [0, H - 0.15, z], c('#55524c'), 0.04);
  // 往上的石階（+Z 樓梯口外）
  for (let i = 0; i < 6; i++) box([2.2, 0.25, 0.5], [0, 0.12 + i * 0.25, D / 2 + 0.3 + i * 0.5], c('#85827a'), 0.06);
  // 牆上的燈座
  const glow: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-W / 2 + 0.2, -1.5], [W / 2 - 0.2, 1.5]] as const) {
    box([0.2, 0.15, 0.2], [x, 1.8, z], c('#3f3a36'), 0);
    glow.push(sphere(0.12, [x, 2, z], glowColor('#ffb05a', 2.2), [1, 1.4, 1], 1));
  }
  // 牆角的苔蘚與水漬
  const plant: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) plant.push(leaf(rand() * Math.PI * 2, 0.25, 0.08, 0.3, c('#4f6a4a'), c('#7f9a6a'), 0.01).translate((rand() - 0.5) * (W - 1), 0, -D / 2 + 0.3 + rand() * 0.5));
  return { solid: merge(solid, '燈塔地窖'), plant: merge(plant, '地窖的苔'), glow: merge(glow, '地窖的燈') };
}

/** 燈塔旁地上的地窖門：石框圍著兩片木板門，鐵把手 */
function cellarHatch(): ForestModel {
  const solid = [
    cylinder(0.85, 0.95, 0.12, [0, 0, 0], c('#7d7a72'), 8),
  ];
  for (const x of [-0.3, 0.3]) {
    const g = new THREE.BoxGeometry(0.56, 0.06, 1.2);
    g.translate(x, 0.14, 0);
    solid.push(paint(g, c('#7a5233')));
  }
  solid.push(cylinder(0.03, 0.03, 0.2, [0.1, 0.18, 0], c('#3f3a36'), 5, [0, 0, Math.PI / 2]));
  return { solid: merge(solid, '地窖門') };
}

/** 符號石片（任務 7M）：手掌大的圓石片，刻著晨（太陽）、芽（嫩芽）、潮（波浪）其中一個符號，刻紋微微發光 */
function symbolStone(kind: 'dawn' | 'sprout' | 'tide'): ForestModel {
  const disc = new THREE.CylinderGeometry(0.28, 0.3, 0.08, 14);
  disc.translate(0, 0.05, 0);
  const solid = [paint(disc, c('#8f8b80'))];
  const color = kind === 'dawn' ? '#ffd77a' : kind === 'sprout' ? '#8de6be' : '#8fd0ff';
  const glow: THREE.BufferGeometry[] = [];
  const mark = (g: THREE.BufferGeometry) => glow.push(paint(g, glowColor(color, 1.8)));
  if (kind === 'dawn') {
    const sun = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10);
    sun.translate(0, 0.1, 0);
    mark(sun);
    for (let i = 0; i < 8; i++) {
      const r = new THREE.BoxGeometry(0.025, 0.02, 0.07);
      r.translate(0, 0.1, 0.13);
      r.rotateY((i / 8) * Math.PI * 2);
      mark(r);
    }
  } else if (kind === 'sprout') {
    const stem = new THREE.BoxGeometry(0.025, 0.02, 0.16);
    stem.translate(0, 0.1, 0.02);
    mark(stem);
    for (const sx of [-1, 1]) {
      const l = new THREE.SphereGeometry(0.06, 8, 6);
      l.scale(1.3, 0.25, 0.6);
      l.translate(sx * 0.07, 0.1, -0.06);
      mark(l);
    }
  } else {
    for (const z of [-0.07, 0.07]) {
      for (let i = 0; i < 4; i++) {
        const w = new THREE.BoxGeometry(0.07, 0.02, 0.025);
        w.rotateY((i % 2 ? 1 : -1) * 0.5);
        w.translate(-0.15 + i * 0.1, 0.1, z + (i % 2 ? 0.02 : -0.02));
        mark(w);
      }
    }
  }
  return { solid: merge(solid, '符號石片'), glow: merge(glow, '石片的刻紋') };
}

/** 石環（任務 7M）：圓形石座上五個凹槽（晨、芽、潮、風、霜）；放回石片後晨、芽、潮三個亮起，風與霜仍空著 */
function stoneRing(filled: boolean): ForestModel {
  const solid = [cylinder(1.2, 1.3, 0.35, [0, 0, 0], c('#7d7a72'), 20), cylinder(0.3, 0.35, 0.5, [0, 0.35, 0], c('#6b6862'), 10)];
  const glow: THREE.BufferGeometry[] = [];
  const colors = ['#ffd77a', '#8de6be', '#8fd0ff'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * 0.85;
    const z = Math.sin(a) * 0.85;
    solid.push(cylinder(0.24, 0.24, 0.06, [x, 0.33, z], c('#4f4c47'), 12));
    if (filled && i < 3) {
      solid.push(cylinder(0.22, 0.22, 0.06, [x, 0.37, z], c('#8f8b80'), 12));
      glow.push(sphere(0.07, [x, 0.46, z], glowColor(colors[i]!, 2.2), [1, 0.5, 1], 1));
    }
  }
  if (filled) glow.push(sphere(0.12, [0, 0.92, 0], glowColor('#fff2c0', 1.8), [1, 1, 1], 1));
  return { solid: merge(solid, '石環'), ...(glow.length ? { glow: merge(glow, '石環的光') } : {}) };
}

export const dawnBuilders: Record<string, () => ForestModel> = {
  lantern_shard: lanternShard,
  mist_core: () => mistCore(false),
  mist_core_clear: () => mistCore(true),
  lighthouse_lamp: () => lighthouseLamp(false),
  lighthouse_lamp_lit: () => lighthouseLamp(true),
  star_mirror: starMirror,
  dry_cloth: dryCloth,
  garden_plot_0: () => gardenPlot(0),
  garden_plot_1: () => gardenPlot(1),
  garden_plot_2: () => gardenPlot(2),
  soil_mound: soilMound,
  footprints: footprints,
  berry_bush: () => berryBush(false),
  berry_bush_picked: () => berryBush(true),
  river_nest: () => riverNest(false),
  river_nest_fed: () => riverNest(true),
  bunny_hide: bunnyHide,
  cellar_room: cellarRoom,
  cellar_hatch: cellarHatch,
  symbol_stone_dawn: () => symbolStone('dawn'),
  symbol_stone_sprout: () => symbolStone('sprout'),
  symbol_stone_tide: () => symbolStone('tide'),
  stone_ring: () => stoneRing(false),
  stone_ring_filled: () => stoneRing(true),
};
