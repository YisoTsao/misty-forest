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

export const dawnBuilders: Record<string, () => ForestModel> = {
  lantern_shard: lanternShard,
  mist_core: () => mistCore(false),
  mist_core_clear: () => mistCore(true),
  lighthouse_lamp: () => lighthouseLamp(false),
  lighthouse_lamp_lit: () => lighthouseLamp(true),
};
