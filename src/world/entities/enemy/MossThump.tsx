import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { filledTroughs } from '@/game-core/authority/rules';
import type { BossDef, EnemyDef } from '@/game-core/combat/combat';
import { authority } from '@/game/authority';
import { updateBossAi } from '@/game/combat/bossRuntime';
import { enemyRuntime, enemyY, removeEnemyVisual } from '@/game/combat/combatRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import { patchMist } from '@/render/mist';
import { toonGradient } from '@/render/toon';

/**
 * 苔咚，苔冠守衛（任務 8D，Bible §6.5）：巨大的圓蘑菇與樹根結合。奶油色菌傘、深綠苔甲、短粗根腳、背上的發光小花；
 * 迷霧期菌傘邊緣呈灰紫色，身邊飄著迷霧（水槽注水後逐漸退去）。身高約玩家的 2.4 倍。
 * 沒有骨架：腳、身體、菌傘分開以程式動畫擺動。招式的預兆（Bible §11.2）畫在地上：根刺與震地的落點圈、孢子的扇形。
 * 同時只有一隻頭目，材質與幾何在模組內共用（預熱與戰鬥用同一份，program 不會被刪掉）。
 */
type BossEnemy = EnemyDef & { boss: BossDef };

const VANISH_SEC = 2.4;
const FADE_IN_SEC = 0.6;
/** 身體中心離地高度、碰撞球半徑 */
const BODY_Y = 1.7;
const BODY_RADIUS = 1.5;
const JUMP_HEIGHT = 3.6;
/** 開場從地底鑽出來的深度 */
const INTRO_DEPTH = 4.6;
const LEGS: [number, number][] = [
  [-0.78, 0.55],
  [0.78, 0.55],
  [-0.78, -0.6],
  [0.78, -0.6],
];

const c = (hex: string) => new THREE.Color(hex);

function colored(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position!.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function sphere(r: number, at: [number, number, number], color: THREE.Color, squash: [number, number, number] = [1, 1, 1], detail = 2): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(...squash);
  g.translate(...at);
  return colored(g, color);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g;
  });
  const out = mergeGeometries(flat);
  new Set([...parts, ...flat]).forEach((g) => g.dispose());
  if (!out) throw new Error('苔咚的幾何合併失敗');
  out.computeBoundingSphere();
  return out;
}

type Shape = { leg: THREE.BufferGeometry; torso: THREE.BufferGeometry; cap: THREE.BufferGeometry; rim: THREE.BufferGeometry; flowers: THREE.BufferGeometry; puff: THREE.BufferGeometry; star: THREE.BufferGeometry };

function buildShape(): Shape {
  const bark = c('#6b4a35');
  const barkDark = c('#4c3426');
  const moss = c('#386b53');
  const mossLight = c('#5f9a6a');
  // 根腳：粗短、往下變細，腳底分出幾根小根
  const legParts = [colored(new THREE.CylinderGeometry(0.3, 0.38, 1.0, 9).translate(0, 0.5, 0), bark), sphere(0.36, [0, 0.12, 0.05], barkDark, [1.15, 0.5, 1.3])];
  for (let i = 0; i < 3; i++) {
    const a = -0.6 + i * 0.6;
    const toe = new THREE.ConeGeometry(0.1, 0.5, 6);
    toe.rotateX(Math.PI / 2 + 0.5);
    toe.rotateY(a);
    toe.translate(Math.sin(a) * 0.32, 0.06, Math.cos(a) * 0.32);
    legParts.push(colored(toe, barkDark));
  }
  // 身體：深綠苔甲，零星的樹皮甲片與淺色苔塊；正面（+Z）是臉
  const torso = [sphere(1.25, [0, BODY_Y, 0], moss, [1.1, 0.95, 1])];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const y = BODY_Y - 0.4 + (i % 3) * 0.35;
    if (Math.cos(a) > 0.55) continue; // 臉的位置不放
    torso.push(sphere(0.42, [Math.sin(a) * 1.15, y, Math.cos(a) * 1.05], i % 2 ? bark : mossLight, [1, 0.7, 0.45], 1));
  }
  // 臉：大眼睛、亮點、小嘴、兩頰的苔
  for (const side of [-1, 1]) {
    torso.push(sphere(0.2, [side * 0.42, BODY_Y + 0.28, 1.12], c('#2a2a22'), [0.9, 1.15, 0.5]));
    torso.push(sphere(0.07, [side * 0.42 + 0.06, BODY_Y + 0.38, 1.21], c('#ffffff'), [1, 1, 0.6], 1));
    torso.push(sphere(0.16, [side * 0.78, BODY_Y - 0.02, 0.92], mossLight, [1, 0.6, 0.6], 1));
  }
  torso.push(sphere(0.12, [0, BODY_Y - 0.12, 1.2], c('#3b2a22'), [1.6, 0.55, 0.5], 1));
  // 菌傘：奶油色圓頂、底下的菌褶、淺色斑點（傘緣另外一個部件，顏色隨迷霧改變）
  const dome = new THREE.SphereGeometry(2.3, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.62, 1);
  dome.translate(0, 2.75, 0);
  const gills = new THREE.CylinderGeometry(2.2, 1.1, 0.38, 26, 1, true);
  gills.translate(0, 2.56, 0);
  const cap = [colored(dome, c('#f1e4c4')), colored(gills, c('#d6c29a'))];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const r = 0.7 + (i % 3) * 0.45;
    const y = 2.75 + Math.sqrt(Math.max(0, 1 - (r / 2.3) ** 2)) * 2.3 * 0.62;
    cap.push(sphere(0.2 + (i % 2) * 0.08, [Math.cos(a) * r, y - 0.02, Math.sin(a) * r], c('#fff8e6'), [1, 0.3, 1], 1));
  }
  const rim = new THREE.TorusGeometry(2.24, 0.17, 8, 40);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, 2.76, 0);
  // 背上（菌傘後半）的發光小花：五片花瓣與花心
  const flowers: THREE.BufferGeometry[] = [];
  const glow = (hex: string, power: number) => new THREE.Color(hex).multiplyScalar(power);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i - 2.5) * 0.42;
    const r = 1.1 + (i % 2) * 0.55;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const y = 2.75 + Math.sqrt(Math.max(0, 1 - (r / 2.3) ** 2)) * 2.3 * 0.62 + 0.04;
    const petal = i % 2 ? glow('#ffc6e8', 1.5) : glow('#8de6be', 1.7);
    for (let k = 0; k < 5; k++) {
      const pa = (k / 5) * Math.PI * 2;
      flowers.push(sphere(0.1, [x + Math.cos(pa) * 0.13, y, z + Math.sin(pa) * 0.13], petal, [1, 0.35, 1], 0));
    }
    flowers.push(sphere(0.07, [x, y + 0.04, z], glow('#fff6b8', 2), [1, 0.8, 1], 0));
  }
  const star = new THREE.OctahedronGeometry(0.16, 0);
  return {
    leg: merge(legParts),
    torso: merge(torso),
    cap: merge(cap),
    rim: merge([colored(rim, c('#ffffff'))]),
    flowers: merge(flowers),
    puff: new THREE.IcosahedronGeometry(0.55, 1),
    star,
  };
}

/** 招式預兆的地面圖形 */
type Markers = { ring: THREE.BufferGeometry; disc: THREE.BufferGeometry; spike: THREE.BufferGeometry };

function buildMarkers(): Markers {
  const ring = new THREE.RingGeometry(0.9, 1, 40);
  ring.rotateX(-Math.PI / 2);
  const disc = new THREE.CircleGeometry(1, 40);
  disc.rotateX(-Math.PI / 2);
  // 根刺：一叢尖尖的樹根
  const spikes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.55;
    const h = i === 0 ? 1.9 : 1.1 + (i % 2) * 0.35;
    const g = new THREE.ConeGeometry(i === 0 ? 0.32 : 0.2, h, 7);
    g.translate(0, h / 2, 0);
    g.rotateZ(i === 0 ? 0 : 0.28 * Math.cos(a));
    g.rotateX(i === 0 ? 0 : 0.28 * Math.sin(a));
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    spikes.push(colored(g, i === 0 ? c('#5b3d2a') : c('#6b4a35')));
  }
  return { ring, disc, spike: merge(spikes) };
}

let shared: { shape: Shape; markers: Markers; materials: ReturnType<typeof buildMaterials> } | null = null;

function buildMaterials() {
  const body = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, transparent: true }));
  const rim = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#8a7fa8', transparent: true }));
  const flowers = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true });
  // 迷霧團：淡紫白、自己微微發亮（不然在陰影裡會變成深灰色的球）
  const mist = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#d4cdee', emissive: '#6d6494', transparent: true, depthWrite: false }));
  const star = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2a0').multiplyScalar(1.6), toneMapped: false });
  // 預兆：暖橘色的圈與逐漸填滿的圓（不受霧與光照影響，地面上永遠看得清楚）
  const markRing = new THREE.MeshBasicMaterial({ color: '#ffb36b', transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const markFill = new THREE.MeshBasicMaterial({ color: '#ff7a4d', transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const spore = new THREE.MeshBasicMaterial({ color: '#c9b8ff', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  for (const m of [markRing, markFill, spore]) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
  }
  const spike = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true }));
  return { body, rim, flowers, mist, star, markRing, markFill, spore, spike };
}

function getShared() {
  shared ??= { shape: buildShape(), markers: buildMarkers(), materials: buildMaterials() };
  return shared;
}

/** 扇形（孢子吹出的範圍）：依角度建立，中心在原點、朝 +Z */
function sector(arcDeg: number): THREE.BufferGeometry {
  const arc = (arcDeg * Math.PI) / 180;
  const g = new THREE.CircleGeometry(1, 24, Math.PI / 2 - arc / 2, arc);
  g.rotateX(-Math.PI / 2);
  // CircleGeometry 的 0 度在 +X；轉到 +Z 為中心
  g.rotateY(Math.PI);
  return g;
}

const RIM_MIST = new THREE.Color('#8a7fa8');
const RIM_CLEAR = new THREE.Color('#e8d7b4');
const tmpColor = new THREE.Color();
const SPIKE_LIFE = 1.1;
const MAX_SPIKES = 6;
const PUFFS = 9;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** 苔咚的三招與縮入菌傘（資料一定有；其他頭目用自己的元件） */
function mossMoves(boss: BossDef) {
  const { spikes, slam, spores } = boss.moves;
  if (!spikes || !slam || !spores || !boss.guard) throw new Error('苔咚的資料缺少根刺、震地、孢子或縮入菌傘');
  return { spikes, slam, spores, guard: boss.guard };
}

export function MossThump({ id, def }: { id: string; def: BossEnemy }) {
  const { shape, markers, materials } = getShared();
  const m = mossMoves(def.boss);
  const sporeGeometry = useMemo(() => sector(m.spores.arcDeg), [m.spores.arcDeg]);
  useEffect(() => () => sporeGeometry.dispose(), [sporeGeometry]);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const cap = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Mesh>(null);
  const legs = useRef<(THREE.Mesh | null)[]>([]);
  const puffs = useRef<THREE.Group>(null);
  const stars = useRef<THREE.Group>(null);
  const spikeMarks = useRef<THREE.Group>(null);
  const slamMark = useRef<THREE.Group>(null);
  const sporeMark = useRef<THREE.Mesh>(null);
  const eruptions = useRef<THREE.Group>(null);
  const rb = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const ignoredHandle = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (ignoredHandle.current !== null) cameraIgnoredColliders.delete(ignoredHandle.current);
    },
    [],
  );
  const local = useMemo(() => ({ time: 0, prevState: '', prevX: 0, prevZ: 0, walk: 0, mist: 1, spikes: [] as { x: number; z: number; y: number; age: number }[] }), []);

  useFrame(({ camera }, rawDt) => {
    const v = enemyRuntime.get(id);
    const g = group.current;
    const b = v?.boss;
    if (!v || !b || !g) return;
    g.visible = Math.hypot(camera.position.x - v.ai.x, camera.position.z - v.ai.z) < 120;
    if (ignoredHandle.current === null && collider.current) {
      ignoredHandle.current = collider.current.handle;
      cameraIgnoredColliders.add(ignoredHandle.current);
    }
    const dt = Math.min(rawDt, 1 / 20);
    const paused = currentScreen() === 'paused';
    const ai = v.ai;
    updateBossAi(id, v, def, dt);
    if (!paused) {
      local.time += dt;
      v.fadeIn = Math.min(1, v.fadeIn + dt / FADE_IN_SEC);
      v.flash = Math.max(0, v.flash - dt);
    }
    const time = local.time;
    const st = b.state;
    const timer = b.timer;
    const moves = m;

    // 根刺：前搖結束的那一幀在標記位置冒出來
    if (local.prevState === 'spikes' && st !== 'spikes') {
      for (const m of b.markers) local.spikes.push({ x: m.x, z: m.z, y: enemyY(m.x, m.z), age: 0 });
      while (local.spikes.length > MAX_SPIKES) local.spikes.shift();
    }
    local.prevState = st;

    // 迷霧：依已注水的水槽數退去（傘緣從灰紫變回奶油色）
    const filled = filledTroughs(authority.getState(), def.boss);
    const mistTarget = 1 - filled / def.boss.troughs.length;
    if (!paused) local.mist += (mistTarget - local.mist) * Math.min(1, dt * 1.5);
    materials.rim.color.copy(RIM_MIST).lerp(RIM_CLEAR, 1 - local.mist);

    // ── 姿勢 ──
    let lift = 0;
    let sy = 1;
    let sxz = 1;
    let capY = 0;
    let capTiltX = 0;
    let capTiltZ = 0;
    let capScale = 1;
    let legSink = 0;
    let legStep = 0;
    let bodyRoll = 0;
    let windup = 0;
    const moved = Math.hypot(ai.x - local.prevX, ai.z - local.prevZ);
    local.prevX = ai.x;
    local.prevZ = ai.z;
    if (!paused && st === 'chase' && moved > 1e-4) local.walk += dt * 7;
    switch (st) {
      case 'intro': {
        // 從菌樹下的地面鑽出來，最後挺起身子
        const k = Math.min(1, timer / (def.boss.introSec * 0.6));
        lift = -INTRO_DEPTH * (1 - easeOut(k));
        capTiltZ = Math.sin(time * 30) * 0.05 * (1 - k);
        if (k >= 1) sy = 1 + Math.sin(Math.min(1, (timer - def.boss.introSec * 0.6) / 0.5) * Math.PI) * 0.12;
        break;
      }
      case 'chase':
        legStep = Math.sin(local.walk);
        bodyRoll = Math.sin(local.walk) * 0.06;
        lift = Math.abs(Math.cos(local.walk)) * 0.12;
        break;
      case 'spikes': {
        // 用力跺腳、菌傘發抖
        windup = timer / moves.spikes.windup;
        sy = 1 - 0.1 * windup;
        capTiltZ = Math.sin(time * 38) * 0.05 * windup;
        legStep = Math.sin(time * 14) * windup;
        break;
      }
      case 'slam': {
        windup = timer / moves.slam.windup;
        sy = 1 - 0.24 * easeOut(windup);
        sxz = 1 + 0.12 * easeOut(windup);
        break;
      }
      case 'air': {
        const t = Math.min(1, timer / moves.slam.air);
        lift = 4 * JUMP_HEIGHT * t * (1 - t);
        sy = 1.14 - 0.14 * t;
        sxz = 0.94;
        windup = 1;
        break;
      }
      case 'recover': {
        // 根腳卡進地裡、頭昏眼花
        const k = Math.min(1, timer / 0.15);
        sy = 1 - 0.18 * (1 - k) + 0.02 * Math.sin(time * 5);
        legSink = 0.35;
        bodyRoll = Math.sin(time * 3.2) * 0.1;
        break;
      }
      case 'spores': {
        windup = timer / moves.spores.windup;
        capScale = 1 + 0.16 * windup + Math.sin(time * 18) * 0.025 * windup;
        capTiltX = 0.22 * windup;
        break;
      }
      case 'guard': {
        // 縮進菌傘：身體縮小、菌傘壓下來蓋住
        const k = Math.min(1, timer / 0.3) * Math.min(1, (m.guard.sec - timer) / 0.3);
        capY = -1.35 * k;
        sy = 1 - 0.35 * k;
        capScale = 1 + 0.08 * k;
        legSink = 0.5 * k;
        break;
      }
      case 'dead':
        break;
    }

    // 倒下：慢慢縮小（Bible：戰後縮成普通尺寸），最後淡出
    let opacity = v.fadeIn;
    let shrink = 1;
    if (v.vanishing !== null) {
      if (!paused) v.vanishing += dt;
      const t = Math.min(1, v.vanishing / VANISH_SEC);
      shrink = 1 - 0.65 * easeOut(Math.min(1, t * 1.4));
      opacity *= 1 - Math.max(0, (t - 0.7) / 0.3);
      bodyRoll = Math.sin(time * 6) * 0.08 * (1 - t);
      if (t >= 1) {
        removeEnemyVisual(id);
        return;
      }
    }

    const ground = enemyY(ai.x, ai.z);
    g.position.set(ai.x, ground + lift, ai.z);
    g.rotation.y = ai.yaw;
    g.scale.setScalar(shrink);
    if (body.current) {
      body.current.scale.set(sxz, sy, sxz);
      body.current.rotation.z = bodyRoll;
    }
    if (cap.current) {
      cap.current.position.y = capY;
      cap.current.rotation.set(capTiltX, 0, capTiltZ);
      cap.current.scale.setScalar(capScale);
    }
    legs.current.forEach((leg, i) => {
      if (!leg) return;
      const [lx, lz] = LEGS[i]!;
      const phase = i === 0 || i === 3 ? 1 : -1;
      leg.position.set(lx, -legSink + Math.max(0, legStep * phase) * 0.2, lz);
      leg.rotation.x = legStep * phase * 0.25;
    });

    // 外觀：閃白 > 出招前搖轉紅
    const flash = v.flash > 0 ? 0.85 : 0.2 * Math.min(1, windup);
    tmpColor.setRGB(flash, flash * (v.flash > 0 ? 1 : 0.3), flash * (v.flash > 0 ? 1 : 0.22));
    for (const m of [materials.body, materials.rim]) {
      m.opacity = opacity;
      m.depthWrite = opacity > 0.98;
      m.emissive.copy(tmpColor);
    }
    materials.flowers.opacity = opacity;

    // 身邊的迷霧：繞著身體慢慢轉，水槽注水後變淡
    if (puffs.current) {
      puffs.current.children.forEach((p, i) => {
        const a = (i / PUFFS) * Math.PI * 2 + time * 0.5;
        const r = 2.2 + Math.sin(time * 1.3 + i) * 0.3;
        p.position.set(Math.cos(a) * r, 1.2 + (i % 3) * 0.9 + Math.sin(time * 2 + i * 1.7) * 0.2, Math.sin(a) * r);
        p.scale.setScalar(0.8 + 0.3 * Math.sin(time * 1.7 + i));
      });
      puffs.current.visible = local.mist > 0.02;
    }
    materials.mist.opacity = 0.42 * local.mist * opacity;
    if (stars.current) {
      stars.current.visible = st === 'recover';
      stars.current.rotation.y = time * 3;
    }

    // ── 預兆 ──
    if (spikeMarks.current) {
      spikeMarks.current.children.forEach((mark, i) => {
        const m = st === 'spikes' ? b.markers[i] : undefined;
        mark.visible = m !== undefined;
        if (!m) return;
        const k = Math.min(1, timer / moves.spikes.windup);
        mark.position.set(m.x, enemyY(m.x, m.z) + 0.06, m.z);
        mark.scale.setScalar(moves.spikes.radius);
        mark.children[1]!.scale.setScalar(Math.max(0.01, k));
      });
    }
    if (slamMark.current) {
      const show = st === 'slam' || st === 'air';
      slamMark.current.visible = show;
      if (show) {
        const k = st === 'slam' ? 0.5 * (timer / moves.slam.windup) : 0.5 + 0.5 * Math.min(1, timer / moves.slam.air);
        slamMark.current.position.set(b.slamTo.x, enemyY(b.slamTo.x, b.slamTo.z) + 0.07, b.slamTo.z);
        slamMark.current.scale.setScalar(moves.slam.radius);
        slamMark.current.children[1]!.scale.setScalar(Math.max(0.01, k));
      }
    }
    if (sporeMark.current) {
      sporeMark.current.visible = st === 'spores';
      if (st === 'spores') {
        const k = Math.min(1, timer / moves.spores.windup);
        sporeMark.current.position.set(ai.x, ground + 0.08, ai.z);
        sporeMark.current.rotation.y = ai.yaw;
        sporeMark.current.scale.setScalar(moves.spores.range * (0.3 + 0.7 * k));
      }
    }
    // 冒出來的根刺：迅速突起、停一下、縮回地裡
    if (eruptions.current) {
      for (const s of local.spikes) if (!paused) s.age += dt;
      local.spikes = local.spikes.filter((s) => s.age < SPIKE_LIFE);
      eruptions.current.children.forEach((mesh, i) => {
        const s = local.spikes[i];
        mesh.visible = s !== undefined;
        if (!s) return;
        const up = Math.min(1, s.age / 0.12);
        const down = Math.max(0, (s.age - 0.6) / (SPIKE_LIFE - 0.6));
        mesh.position.set(s.x, s.y - 0.2, s.z);
        mesh.scale.set(1, Math.max(0.01, easeOut(up) * (1 - down)), 1);
      });
    }

    const bodyY = ground + lift + BODY_Y * shrink;
    if (v.vanishing === null) rb.current?.setNextKinematicTranslation({ x: ai.x, y: bodyY, z: ai.z });
    else rb.current?.setNextKinematicTranslation({ x: ai.x, y: -100, z: ai.z });
  });

  const v = enemyRuntime.get(id);
  const start: [number, number, number] = v ? [v.ai.x, enemyY(v.ai.x, v.ai.z) - INTRO_DEPTH, v.ai.z] : [0, -100, 0];
  return (
    <>
      <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={start}>
        <BallCollider ref={collider} args={[BODY_RADIUS]} />
      </RigidBody>
      <group ref={group} position={start} name={`enemy:${id}`}>
        <group ref={body}>
          {LEGS.map(([x, z], i) => (
            <mesh
              key={i}
              ref={(m) => {
                legs.current[i] = m;
              }}
              geometry={shape.leg}
              material={materials.body}
              position={[x, 0, z]}
              castShadow
            />
          ))}
          <mesh ref={torso} geometry={shape.torso} material={materials.body} castShadow />
          <group ref={cap}>
            <mesh geometry={shape.cap} material={materials.body} castShadow />
            <mesh geometry={shape.rim} material={materials.rim} castShadow />
            <mesh geometry={shape.flowers} material={materials.flowers} />
          </group>
        </group>
        <group ref={puffs}>
          {Array.from({ length: PUFFS }, (_, i) => (
            <mesh key={i} geometry={shape.puff} material={materials.mist} />
          ))}
        </group>
        <group ref={stars} position={[0, 4.6, 0]} visible={false}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={shape.star} material={materials.star} position={[Math.cos((i / 3) * Math.PI * 2) * 0.9, 0, Math.sin((i / 3) * Math.PI * 2) * 0.9]} />
          ))}
        </group>
      </group>
      {/* 預兆與根刺在世界座標 */}
      <group ref={spikeMarks}>
        {Array.from({ length: Math.max(m.spikes.count, m.spikes.count2) }, (_, i) => (
          <group key={i} visible={false}>
            <mesh geometry={markers.ring} material={materials.markRing} renderOrder={2} />
            <mesh geometry={markers.disc} material={materials.markFill} renderOrder={2} />
          </group>
        ))}
      </group>
      <group ref={slamMark} visible={false}>
        <mesh geometry={markers.ring} material={materials.markRing} renderOrder={2} />
        <mesh geometry={markers.disc} material={materials.markFill} renderOrder={2} />
      </group>
      <mesh ref={sporeMark} geometry={sporeGeometry} material={materials.spore} visible={false} renderOrder={2} />
      <group ref={eruptions}>
        {Array.from({ length: MAX_SPIKES }, (_, i) => (
          <mesh key={i} geometry={markers.spike} material={materials.spike} visible={false} castShadow />
        ))}
      </group>
    </>
  );
}

/** shader 預熱用（ShaderWarmup）：每種部件與預兆各畫一次；材質是模組共用的，不會在卸載時釋放 */
export function MossThumpWarmup() {
  const { shape, markers, materials } = getShared();
  return (
    <>
      <mesh geometry={shape.leg} material={materials.body} castShadow />
      <mesh geometry={shape.rim} material={materials.rim} castShadow />
      <mesh geometry={shape.flowers} material={materials.flowers} />
      <mesh geometry={shape.puff} material={materials.mist} />
      <mesh geometry={shape.star} material={materials.star} />
      <mesh geometry={markers.ring} material={materials.markRing} />
      <mesh geometry={markers.disc} material={materials.markFill} />
      <mesh geometry={markers.disc} material={materials.spore} />
      <mesh geometry={markers.spike} material={materials.spike} castShadow />
    </>
  );
}

let buddyMaterials: { body: THREE.Material; rim: THREE.Material; flowers: THREE.Material } | null = null;

/** 戰後的苔咚用的材質（不透明、傘緣奶油色；頭目的共用材質會在戰鬥中改透明度與顏色，不能共用） */
function getBuddyMaterials() {
  buddyMaterials ??= {
    body: patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true })),
    rim: patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: RIM_CLEAR })),
    flowers: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return buddyMaterials;
}

/**
 * 戰後的苔咚（任務 8D-2，Bible §6.5：縮成普通尺寸，成為森林的守護 NPC，以動作和泡泡音表達）。
 * 外形與頭目相同，只做待機的呼吸與搖擺；說話時（talking）開心地小跳。位置、面向由 NPC 系統寫在外層 group。
 * 頭目倒下縮小的動畫還在播時，等它播完再從地上冒出來。
 */
export function MossThumpBuddy({ talking }: { talking: () => boolean }) {
  const { shape } = getShared();
  const materials = getBuddyMaterials();
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const cap = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Mesh | null)[]>([]);
  const local = useMemo(() => {
    const vanishing = [...enemyRuntime.values()].some((v) => v.boss && v.vanishing !== null);
    return { time: 0, delay: vanishing ? VANISH_SEC : 0, appear: 0, hop: 0 };
  }, []);

  useFrame((_, rawDt) => {
    if (currentScreen() === 'paused') return;
    const dt = Math.min(rawDt, 1 / 20);
    local.time += dt;
    if (local.delay > 0) {
      local.delay -= dt;
      if (root.current) root.current.visible = false;
      return;
    }
    local.appear = Math.min(1, local.appear + dt / 0.6);
    if (talking()) local.hop += dt;
    else local.hop = 0;
    const t = local.time;
    const r = root.current;
    if (!r) return;
    r.visible = true;
    // 從地上冒出來（稍微彈一下）
    const k = local.appear;
    const pop = k < 1 ? 1 + 0.18 * Math.sin(k * Math.PI) - (1 - easeOut(k)) : 1;
    r.scale.setScalar(Math.max(0.01, pop));
    // 說話時一下一下地跳
    const hop = local.hop > 0 ? Math.abs(Math.sin(local.hop * 7)) * 0.5 : 0;
    r.position.y = hop;
    if (body.current) {
      const breathe = 1 + Math.sin(t * 2.2) * 0.03;
      body.current.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
      body.current.rotation.z = Math.sin(t * 1.3) * 0.05;
    }
    if (cap.current) cap.current.rotation.set(Math.sin(t * 1.1) * 0.04, 0, Math.sin(t * 1.7) * 0.06 + (hop > 0 ? Math.sin(local.hop * 14) * 0.08 : 0));
    legs.current.forEach((leg, i) => {
      if (!leg) return;
      const [lx, lz] = LEGS[i]!;
      leg.position.set(lx, hop > 0 ? -hop * 0.4 : 0, lz);
    });
  });

  return (
    <group ref={root} visible={false}>
      {LEGS.map(([x, z], i) => (
        <mesh
          key={i}
          ref={(m) => {
            legs.current[i] = m;
          }}
          geometry={shape.leg}
          material={materials.body}
          position={[x, 0, z]}
          castShadow
        />
      ))}
      <group ref={body}>
        <mesh geometry={shape.torso} material={materials.body} castShadow />
        <group ref={cap}>
          <mesh geometry={shape.cap} material={materials.body} castShadow />
          <mesh geometry={shape.rim} material={materials.rim} />
          <mesh geometry={shape.flowers} material={materials.flowers} />
        </group>
      </group>
    </group>
  );
}
