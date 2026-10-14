import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { EnemyDef } from '@/game-core/combat/combat';
import { combat } from '@/game/authority';
import { enemyRuntime, enemyY, removeEnemyVisual } from '@/game/combat/combatRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import { patchMist } from '@/render/mist';
import { toonGradient } from '@/render/toon';
import { updateEnemyAi } from './enemyUpdate';

/**
 * 澄鏡湖的程式造型怪物（任務 9B，Bible §7.6）：
 * - 水泡精：透明的水滴身體，裡面一顆小亮點；漂浮晃動，噴水泡前身體鼓起；被打破時分裂成兩個小水滴（bubble_wisp_small）
 * - 霧鷺影：細長的腳、灰藍羽毛、翼端像水墨暈開；擲霧羽前單腳站立並低頭，擲完向後瞬移
 * - 鏡殼蟹：圓形藍綠甲殼，像小鏡片排列，眼睛大而好奇；正面有鏡殼擋著，出手後殼掀起、露出粉色的肚子（破綻）
 * 部件以程式動畫擺動（沒有骨架）；每隻一份材質（閃白、淡入淡出、前搖）。
 */
export type LakeKind = 'bubble_wisp' | 'bubble_wisp_small' | 'mist_heron' | 'mirror_crab';

const VANISH_SEC = 0.9;
const FADE_IN_SEC = 1.2;
/** 身體中心離地高度 */
const HOVER: Record<LakeKind, number> = { bubble_wisp: 0.95, bubble_wisp_small: 0.7, mist_heron: 0, mirror_crab: 0.3 };
const BODY_RADIUS: Record<LakeKind, number> = { bubble_wisp: 0.45, bubble_wisp_small: 0.26, mist_heron: 0.45, mirror_crab: 0.6 };
/** 模型縮放（小水滴與水泡精同一個造型） */
const SIZE: Record<LakeKind, number> = { bubble_wisp: 1, bubble_wisp_small: 0.55, mist_heron: 1, mirror_crab: 1 };

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

function rod(r: number, len: number, at: [number, number, number], color: THREE.Color, rot: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r * 0.85, len, 6);
  g.translate(0, -len / 2, 0);
  g.rotateX(rot[0]);
  g.rotateY(rot[1]);
  g.rotateZ(rot[2]);
  g.translate(...at);
  return colored(g, color);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    return g;
  });
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const total = flat.reduce((n, g) => n + g.attributes[name]!.array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of flat) {
      arr.set(g.attributes[name]!.array as Float32Array, o);
      o += g.attributes[name]!.array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  new Set([...parts, ...flat]).forEach((g) => g.dispose());
  out.computeBoundingSphere();
  return out;
}

/**
 * 部件：body（主體，不透明材質）、glass（透明材質：水泡的水、蟹殼的鏡片）、
 * a / b（各種族的活動部件：水泡精沒有；鷺的左右腳 a、頭頸 b；蟹的螯 a、殼 b）
 */
type Shape = { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; a: THREE.BufferGeometry; b: THREE.BufferGeometry };

function wispShape(): Shape {
  // 水滴：下圓上尖
  const drop = new THREE.SphereGeometry(0.42, 18, 14);
  const pos = drop.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0) {
      const k = 1 - (y / 0.42) * 0.55;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
      pos.setY(i, y * 1.45);
    }
  }
  drop.computeVertexNormals();
  const body = merge([
    sphere(0.11, [0, 0, 0], c('#fff6c8'), [1, 1, 1], 1),
    sphere(0.06, [-0.13, 0.1, 0.36], c('#1f3a4a'), [1, 1.2, 0.6], 1),
    sphere(0.06, [0.13, 0.1, 0.36], c('#1f3a4a'), [1, 1.2, 0.6], 1),
    sphere(0.02, [-0.11, 0.13, 0.4], c('#ffffff'), [1, 1, 1], 0),
    sphere(0.02, [0.15, 0.13, 0.4], c('#ffffff'), [1, 1, 1], 0),
  ]);
  const glass = merge([colored(drop, c('#8fdcec')), sphere(0.09, [-0.15, 0.25, 0.28], c('#ffffff'), [1, 1.4, 0.5], 1)]);
  return { body, glass, a: sphere(0.01, [0, 0, 0], c('#ffffff'), [1, 1, 1], 0), b: sphere(0.01, [0, 0, 0], c('#ffffff'), [1, 1, 1], 0) };
}

function heronShape(): Shape {
  const grey = c('#8fa3b8');
  const light = c('#d4dee8');
  const ink = c('#3f4a5c');
  const body = merge([
    sphere(0.36, [0, 1.25, -0.05], grey, [0.85, 0.75, 1.35]),
    sphere(0.3, [0, 1.18, 0.08], light, [0.8, 0.7, 1.1]),
    // 翅膀（收在身側），翼端是水墨暈開的深色
    sphere(0.3, [-0.27, 1.3, -0.12], grey, [0.25, 0.6, 1.3]),
    sphere(0.3, [0.27, 1.3, -0.12], grey, [0.25, 0.6, 1.3]),
    sphere(0.18, [-0.27, 1.22, -0.48], ink, [0.25, 0.5, 1.1]),
    sphere(0.18, [0.27, 1.22, -0.48], ink, [0.25, 0.5, 1.1]),
    // 尾羽
    sphere(0.14, [0, 1.15, -0.55], ink, [0.6, 0.3, 1.2]),
  ]);
  const leg = merge([rod(0.025, 0.95, [0, 0.95, 0], c('#c9a36a')), sphere(0.05, [0, 0.03, 0.08], c('#c9a36a'), [1.2, 0.4, 2])]);
  // 頭頸（以頸根為原點，往上往前）
  const neck = merge([
    rod(0.07, 0.55, [0, 0.55, 0], light),
    sphere(0.13, [0, 0.6, 0.05], light, [0.9, 0.95, 1.15]),
    sphere(0.035, [-0.08, 0.64, 0.12], c('#1f2430'), [1, 1, 1], 1),
    sphere(0.035, [0.08, 0.64, 0.12], c('#1f2430'), [1, 1, 1], 1),
    colored(new THREE.ConeGeometry(0.045, 0.42, 6).rotateX(Math.PI / 2).translate(0, 0.58, 0.36), c('#e0b85a')),
    // 頭上的水墨羽冠
    colored(new THREE.ConeGeometry(0.03, 0.3, 5).rotateX(-2.2).translate(0, 0.7, -0.15), ink),
  ]);
  return { body, glass: sphere(0.01, [0, 0, 0], grey, [1, 1, 1], 0), a: leg, b: neck };
}

function crabShape(): Shape {
  const body = merge([
    // 粉色的肚子（殼掀起時才看得到）
    sphere(0.5, [0, -0.02, 0], c('#f2a6a0'), [1.05, 0.35, 0.9]),
    // 眼柄與大眼睛
    rod(0.03, 0.25, [-0.16, 0.42, 0.42], c('#5f8f84')),
    rod(0.03, 0.25, [0.16, 0.42, 0.42], c('#5f8f84')),
    sphere(0.1, [-0.16, 0.46, 0.42], c('#ffffff')),
    sphere(0.1, [0.16, 0.46, 0.42], c('#ffffff')),
    sphere(0.055, [-0.16, 0.47, 0.5], c('#1f2a30'), [1, 1, 0.6], 1),
    sphere(0.055, [0.16, 0.47, 0.5], c('#1f2a30'), [1, 1, 0.6], 1),
  ]);
  // 腳（左右各三隻，在 body 裡；螯在 a）
  const legs: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) legs.push(rod(0.035, 0.42, [side * 0.48, 0.05, -0.2 + k * 0.2], c('#4f8f84'), [0, 0, side * 2.2]));
  const fullBody = merge([body, ...legs]);
  const claw = merge([rod(0.06, 0.3, [0, 0, 0], c('#4f9a8c'), [-1.2, 0, 0]), sphere(0.15, [0, -0.12, 0.3], c('#5fb0a0'), [0.8, 0.7, 1.1]), sphere(0.07, [0.05, -0.05, 0.42], c('#7fd0c0'), [0.6, 0.6, 1])]);
  // 殼（以後緣為軸，原點在殼的後緣；破綻時往後掀起）
  const shellGeo = new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  shellGeo.scale(1, 0.55, 0.95);
  shellGeo.translate(0, 0, 0.5);
  const shell = merge([colored(shellGeo, c('#4f9fa0'))]);
  // 鏡片：殼上一圈小圓片（透明材質、偏亮）
  const tiles: THREE.BufferGeometry[] = [];
  for (let ring = 0; ring < 2; ring++) {
    const n = ring === 0 ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      const r = ring === 0 ? 0.42 : 0.2;
      const y = Math.sqrt(Math.max(0, 1 - (r / 0.62) ** 2)) * 0.62 * 0.55;
      tiles.push(sphere(0.1, [Math.cos(a) * r, y + 0.01, 0.5 + Math.sin(a) * r * 0.95], c('#d8f4f8'), [1, 0.25, 1], 1));
    }
  }
  return { body: fullBody, glass: merge(tiles), a: claw, b: shell };
}

const shapes = new Map<LakeKind, Shape>();
function shapeFor(kind: LakeKind): Shape {
  const key = kind === 'bubble_wisp_small' ? 'bubble_wisp' : kind;
  let s = shapes.get(key);
  if (!s) {
    s = key === 'bubble_wisp' ? wispShape() : key === 'mist_heron' ? heronShape() : crabShape();
    shapes.set(key, s);
  }
  return s;
}

function makeMaterials(kind: LakeKind): { body: THREE.MeshToonMaterial; glass: THREE.MeshToonMaterial } {
  const body = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, transparent: true }));
  const wisp = kind === 'bubble_wisp' || kind === 'bubble_wisp_small';
  const glass = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, transparent: true, depthWrite: !wisp }));
  if (kind === 'mirror_crab') glass.emissive.setRGB(0.25, 0.32, 0.34);
  return { body, glass };
}

export function LakeCritter({ id, def }: { id: string; def: EnemyDef & { procedural: LakeKind } }) {
  const kind = def.procedural;
  const shape = shapeFor(kind);
  const wisp = kind === 'bubble_wisp' || kind === 'bubble_wisp_small';
  const group = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const partA = useRef<(THREE.Object3D | null)[]>([]);
  const partB = useRef<THREE.Group>(null);
  const rb = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const seed = useMemo(() => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7) / 100, [id]);
  const materials = useMemo(() => makeMaterials(kind), [kind]);
  useEffect(
    () => () => {
      materials.body.dispose();
      materials.glass.dispose();
    },
    [materials],
  );
  const ignoredHandle = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (ignoredHandle.current !== null) cameraIgnoredColliders.delete(ignoredHandle.current);
    },
    [],
  );
  const clock = useRef(0);

  useFrame(({ camera }, rawDt) => {
    const v = enemyRuntime.get(id);
    const g = group.current;
    if (!v || !g) return;
    g.visible = Math.hypot(camera.position.x - v.ai.x, camera.position.z - v.ai.z) < 90;
    if (ignoredHandle.current === null && collider.current) {
      ignoredHandle.current = collider.current.handle;
      cameraIgnoredColliders.add(ignoredHandle.current);
    }
    const spawner = combat.spawners.find((s) => s.id === v.spawner);
    if (!spawner) return;
    const dt = Math.min(rawDt, 1 / 20);
    const paused = currentScreen() === 'paused';
    if (!paused) clock.current += dt;
    const t = clock.current + seed;
    const ai = v.ai;
    updateEnemyAi(id, v, def, spawner, dt);

    if (!paused) {
      v.fadeIn = Math.min(1, v.fadeIn + dt / FADE_IN_SEC);
      v.flash = Math.max(0, v.flash - dt);
    }
    let scale = 1;
    let rise = 0;
    let opacity = v.fadeIn;
    if (v.vanishing !== null) {
      if (!paused) v.vanishing += dt;
      const k = Math.min(1, v.vanishing / VANISH_SEC);
      // 水泡精被打破：一下子脹大後消失
      scale = wisp ? 1 + k * 0.6 : 1 - k * 0.5;
      rise = k * (wisp ? 0.3 : 0.2);
      opacity *= 1 - k;
      if (k >= 1) {
        removeEnemyVisual(id);
        return;
      }
    }
    const windup = ai.state === 'attack' ? Math.min(1, ai.timer / Math.max(def.attackWindup, 0.01)) : 0;
    const spitWindup = ai.state === 'spit' && def.behavior?.kind === 'spit' ? Math.min(1, ai.timer / def.behavior.windup) : 0;
    const charge = Math.max(windup, spitWindup);
    if (v.flash > 0) {
      materials.body.emissive.setRGB(0.9, 0.9, 0.9);
    } else {
      materials.body.emissive.setRGB(charge * 0.5, charge * 0.45, charge * 0.6);
    }
    materials.body.opacity = opacity;
    materials.glass.opacity = opacity * (wisp ? 0.55 : 0.9);

    const ground = enemyY(ai.x, ai.z);
    // 水泡精浮在水面上（地面低於水面時以水面為準）
    let y = Math.max(ground, wisp ? -1 : ground) + HOVER[kind] + rise;
    const body = bodyRef.current;
    const moving = ai.state === 'chase' || ai.state === 'patrol' || ai.state === 'return';
    if (wisp) {
      y += Math.sin(t * 2.2) * 0.12;
      const swell = 1 + spitWindup * 0.3 + windup * 0.15;
      if (body) body.scale.set(swell * (1 + Math.sin(t * 5) * 0.04), swell * (1 - Math.sin(t * 5) * 0.04), swell);
      v.anim = ai.state === 'spit' ? 'spit' : ai.state === 'attack' ? 'windup' : 'float';
    } else if (kind === 'mist_heron') {
      // 擲霧羽前：單腳站立（右腳收起）並低頭；走路時兩腳交替
      const legs = partA.current;
      const step = moving ? Math.sin(clock.current * 9) * 0.45 : 0;
      if (legs[0]) legs[0].rotation.x = step;
      if (legs[1]) {
        legs[1].rotation.x = -step - spitWindup * 1.4;
        legs[1].position.y = 0.95 + spitWindup * 0.25;
      }
      if (partB.current) partB.current.rotation.x = spitWindup * 1.1 + windup * 0.8 + (moving ? Math.sin(clock.current * 9) * 0.08 : Math.sin(t * 1.3) * 0.05);
      if (body) body.rotation.x = spitWindup * 0.25;
      v.anim = ai.state === 'spit' ? 'spit' : ai.state === 'attack' ? 'windup' : moving ? 'walk' : 'idle';
    } else {
      // 鏡殼蟹：橫著走（左右晃）、出手前舉螯、破綻時殼往後掀起露出肚子
      const exposed = ai.state === 'recover';
      partA.current.forEach((claw, i) => {
        if (!claw) return;
        const side = i === 0 ? -1 : 1;
        claw.rotation.x = -windup * 0.9 + (moving ? Math.sin(clock.current * 8 + i) * 0.15 : 0);
        claw.rotation.z = side * (0.2 + windup * 0.3);
      });
      if (partB.current) partB.current.rotation.x = exposed ? -0.75 - Math.sin(clock.current * 10) * 0.08 : 0;
      if (body) body.rotation.z = moving ? Math.sin(clock.current * 10) * 0.08 : 0;
      v.anim = exposed ? 'recover' : ai.state === 'attack' ? 'windup' : moving ? 'walk' : 'idle';
    }
    if (v.vanishing !== null) v.anim = 'death';
    g.position.set(ai.x, y, ai.z);
    g.rotation.y = ai.yaw;
    g.scale.setScalar(SIZE[kind] * scale * (0.6 + 0.4 * v.fadeIn));
    const cy = y + (kind === 'mist_heron' ? 1.2 : 0);
    if (v.vanishing === null) rb.current?.setNextKinematicTranslation({ x: ai.x, y: cy, z: ai.z });
    else rb.current?.setNextKinematicTranslation({ x: ai.x, y: -100, z: ai.z });
  });

  const v = enemyRuntime.get(id);
  const start: [number, number, number] = v ? [v.ai.x, enemyY(v.ai.x, v.ai.z) + HOVER[kind], v.ai.z] : [0, -100, 0];
  return (
    <>
      <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={start}>
        <BallCollider ref={collider} args={[BODY_RADIUS[kind] * 0.9]} />
      </RigidBody>
      <group ref={group} position={start} name={`enemy:${id}`}>
        <group ref={bodyRef}>
          <mesh geometry={shape.body} material={materials.body} castShadow={!wisp} />
          {kind === 'mist_heron' && (
            <>
              {[-0.1, 0.1].map((x, i) => (
                <group key={i} ref={(o) => void (partA.current[i] = o)} position={[x, 0.95, 0]}>
                  <mesh geometry={shape.a} material={materials.body} position={[0, -0.95, 0]} />
                </group>
              ))}
              <group ref={partB} position={[0, 1.45, 0.35]}>
                <mesh geometry={shape.b} material={materials.body} castShadow />
              </group>
            </>
          )}
          {kind === 'mirror_crab' && (
            <>
              {[-1, 1].map((side, i) => (
                <group key={i} ref={(o) => void (partA.current[i] = o)} position={[side * 0.45, 0.15, 0.4]}>
                  <mesh geometry={shape.a} material={materials.body} />
                </group>
              ))}
              <group ref={partB} position={[0, 0.02, -0.5]}>
                <mesh geometry={shape.b} material={materials.body} castShadow />
                <mesh geometry={shape.glass} material={materials.glass} />
              </group>
            </>
          )}
          {!(kind === 'mirror_crab') && <mesh geometry={shape.glass} material={materials.glass} />}
        </group>
      </group>
    </>
  );
}

/** shader 預熱用（ShaderWarmup）：兩種材質各畫一次，載入後就卸載；材質不 dispose（原因見 ModelEnemyWarmup） */
export function LakeCritterWarmup({ kind }: { kind: LakeKind }) {
  const shape = shapeFor(kind);
  const materials = useMemo(() => makeMaterials(kind), [kind]);
  return (
    <>
      <mesh geometry={shape.body} material={materials.body} castShadow />
      <mesh geometry={shape.glass} material={materials.glass} />
    </>
  );
}
