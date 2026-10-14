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
 * 螢苔祕林的程式造型怪物（任務 8B，Bible §6.6）：
 * - 霧孢飛蛾：圓胖的身體、半透明花瓣狀的翅膀（翅緣灰紫斑點），浮在半空拍翅；出手前翅膀快速閃爍
 * - 根鬚甲蟲：木頭與苔蘚混合的圓殼、六隻腳；縮殼時身體壓低、腳收進殼裡；衝撞後有短暫的暈眩破綻，出手前轉紅
 * 部件以程式動畫擺動（沒有骨架）；每隻一份材質（閃白、淡入淡出、前搖），數量很少。
 */
type Kind = NonNullable<EnemyDef['procedural']>;

const VANISH_SEC = 0.9;
const FADE_IN_SEC = 1.2;
/** 身體中心離地高度 */
const HOVER: Record<Kind, number> = { fog_moth: 1.45, root_beetle: 0.42 };
const BODY_RADIUS: Record<Kind, number> = { fog_moth: 0.45, root_beetle: 0.55 };

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
    return g;
  });
  // BufferGeometryUtils 只在這裡用到一次：手動串接（屬性一致）
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

type Shape = { body: THREE.BufferGeometry; limb: THREE.BufferGeometry; extra: THREE.BufferGeometry };

/** 飛蛾：身體（含頭、觸角、眼睛）、一片翅膀（以原點為翅根，沿 +X 展開）、翅緣斑點 */
function mothShape(): Shape {
  const cream = c('#d9cfee');
  const fluff = c('#efe8fb');
  const body = merge([
    sphere(0.36, [0, 0, -0.05], cream, [1, 0.95, 1.15]),
    sphere(0.3, [0, -0.06, -0.12], fluff, [1.1, 0.8, 1.1]),
    sphere(0.24, [0, 0.06, 0.32], cream),
    sphere(0.07, [-0.11, 0.1, 0.5], c('#2a2236'), [1, 1, 0.7], 1),
    sphere(0.07, [0.11, 0.1, 0.5], c('#2a2236'), [1, 1, 0.7], 1),
    sphere(0.025, [-0.09, 0.14, 0.55], c('#ffffff'), [1, 1, 1], 0),
    sphere(0.025, [0.13, 0.14, 0.55], c('#ffffff'), [1, 1, 1], 0),
    colored(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4).rotateX(-0.6).rotateZ(0.35).translate(-0.12, 0.38, 0.45), c('#8b8aa8')),
    colored(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4).rotateX(-0.6).rotateZ(-0.35).translate(0.12, 0.38, 0.45), c('#8b8aa8')),
    sphere(0.05, [-0.2, 0.55, 0.58], c('#c9b8ef'), [1, 1, 1], 1),
    sphere(0.05, [0.2, 0.55, 0.58], c('#c9b8ef'), [1, 1, 1], 1),
  ]);
  // 翅膀：扁平的花瓣（翅根在原點）
  const wing = merge([sphere(0.44, [0.42, 0, 0.05], c('#d9c6f5'), [1, 0.04, 0.62], 2), sphere(0.3, [0.32, 0, -0.38], c('#cdb8ef'), [1, 0.04, 0.7], 2)]);
  const spots = merge([
    sphere(0.07, [0.82, 0.03, 0.12], c('#8b8aa8'), [1, 0.15, 1], 1),
    sphere(0.06, [0.7, 0.03, -0.18], c('#8b8aa8'), [1, 0.15, 1], 1),
    sphere(0.05, [0.55, 0.03, -0.55], c('#77769a'), [1, 0.15, 1], 1),
  ]);
  return { body, limb: wing, extra: spots };
}

/** 甲蟲：殼（含苔蘚）、一隻腳（以原點為關節往下）、頭（含角） */
function beetleShape(): Shape {
  const shellGeo = new THREE.SphereGeometry(0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  shellGeo.scale(1, 0.85, 1.25);
  const body = merge([
    colored(shellGeo, c('#8a5c3a')),
    // 殼中線與木紋
    colored(new THREE.BoxGeometry(0.05, 0.52, 1.5).translate(0, 0.02, 0), c('#5e3e28')),
    sphere(0.6, [0, -0.02, 0], c('#6b4a35'), [1.02, 0.18, 1.27]),
    sphere(0.2, [-0.22, 0.42, -0.2], c('#4f8f5a'), [1.3, 0.45, 1.2]),
    sphere(0.17, [0.24, 0.36, 0.18], c('#5f9a6a'), [1.2, 0.45, 1.3]),
    sphere(0.14, [0.05, 0.48, -0.42], c('#4f8f5a'), [1.3, 0.4, 1.2]),
    sphere(0.06, [0.18, 0.47, -0.1], c('#9fd6a8'), [1, 1, 1], 1),
  ]);
  const leg = merge([colored(new THREE.CylinderGeometry(0.04, 0.03, 0.42, 5).translate(0, -0.21, 0), c('#4c3426'))]);
  const head = merge([
    sphere(0.26, [0, 0, 0], c('#5a3d2a'), [1, 0.85, 0.9]),
    sphere(0.06, [-0.12, 0.05, 0.2], c('#f4f0d8'), [1, 1, 1], 1),
    sphere(0.06, [0.12, 0.05, 0.2], c('#f4f0d8'), [1, 1, 1], 1),
    sphere(0.03, [-0.12, 0.05, 0.25], c('#1f1810'), [1, 1, 1], 0),
    sphere(0.03, [0.12, 0.05, 0.25], c('#1f1810'), [1, 1, 1], 0),
    colored(new THREE.ConeGeometry(0.05, 0.22, 5).rotateX(1.1).translate(-0.1, 0.18, 0.22), c('#7a5a3a')),
    colored(new THREE.ConeGeometry(0.05, 0.22, 5).rotateX(1.1).translate(0.1, 0.18, 0.22), c('#7a5a3a')),
  ]);
  return { body, limb: leg, extra: head };
}

const shapes = new Map<Kind, Shape>();
function shapeFor(kind: Kind): Shape {
  let s = shapes.get(kind);
  if (!s) {
    s = kind === 'fog_moth' ? mothShape() : beetleShape();
    shapes.set(kind, s);
  }
  return s;
}

function makeMaterial(transparentWing = false): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, transparent: true, side: transparentWing ? THREE.DoubleSide : THREE.FrontSide });
  return patchMist(m);
}

/** 甲蟲六隻腳的位置（身體局部座標） */
const BEETLE_LEGS: [number, number, number][] = [
  [-0.5, 0.05, 0.4],
  [0.5, 0.05, 0.4],
  [-0.56, 0.05, 0],
  [0.56, 0.05, 0],
  [-0.5, 0.05, -0.4],
  [0.5, 0.05, -0.4],
];

export function CritterEnemy({ id, def }: { id: string; def: EnemyDef & { procedural: Kind } }) {
  const kind = def.procedural;
  const shape = shapeFor(kind);
  const group = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const limbs = useRef<(THREE.Object3D | null)[]>([]);
  const headRef = useRef<THREE.Mesh>(null);
  const rb = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const seed = useMemo(() => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7) / 100, [id]);
  const materials = useMemo(() => ({ body: makeMaterial(), wing: makeMaterial(kind === 'fog_moth') }), [kind]);
  useEffect(
    () => () => {
      materials.body.dispose();
      materials.wing.dispose();
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
      scale = 1 - k * 0.5;
      rise = k * (kind === 'fog_moth' ? 0.8 : 0.2);
      opacity *= 1 - k;
      if (k >= 1) {
        removeEnemyVisual(id);
        return;
      }
    }
    const charge = ai.state === 'attack' ? Math.min(1, ai.timer / Math.max(def.attackWindup, 0.01)) : 0;
    // 閃白（被擊中）＞ 前搖（飛蛾翅膀快速閃爍成白光、甲蟲轉紅）
    const emissive = materials.body.emissive;
    const wingEmissive = materials.wing.emissive;
    if (v.flash > 0) {
      emissive.setRGB(0.9, 0.9, 0.9);
      wingEmissive.setRGB(0.9, 0.9, 0.9);
    } else if (kind === 'fog_moth') {
      const blink = charge > 0 ? (Math.sin(t * 40) > 0 ? 0.9 : 0.1) * charge : 0;
      emissive.setRGB(0, 0, 0);
      wingEmissive.setRGB(blink, blink * 0.95, blink);
    } else {
      emissive.setRGB(charge * 0.7, charge * 0.08, charge * 0.05);
      wingEmissive.setRGB(0, 0, 0);
    }
    materials.body.opacity = opacity;
    materials.wing.opacity = opacity * (kind === 'fog_moth' ? 0.72 : 1);

    const ground = enemyY(ai.x, ai.z);
    let y = ground + HOVER[kind] + rise;
    const body = bodyRef.current;
    if (kind === 'fog_moth') {
      // 拍翅：一般慢慢拍，盤旋與前搖時越拍越快
      const rate = ai.state === 'attack' ? 26 : ai.state === 'orbit' || ai.state === 'chase' ? 15 : 9;
      // 翅膀在身體上方張成 V 字，上下拍動
      const flap = Math.sin(clock.current * rate + seed) * 0.55 + 0.55;
      limbs.current.forEach((w, i) => {
        if (!w) return;
        const side = i % 2 === 0 ? 1 : -1;
        w.rotation.z = side * flap;
      });
      y += Math.sin(t * 2.4) * 0.14 - charge * 0.3;
      if (body) body.rotation.x = -0.15 + charge * 0.45;
      v.anim = ai.state === 'attack' ? 'windup' : ai.state === 'orbit' ? 'orbit' : 'fly';
    } else {
      const guarding = ai.state === 'guard';
      const dizzy = ai.state === 'recover';
      const moving = ai.state === 'chase' || ai.state === 'patrol' || ai.state === 'return';
      // 縮殼：身體貼地、腳與頭收進殼裡
      const tuck = guarding ? 1 : 0;
      y -= tuck * 0.32;
      limbs.current.forEach((leg, i) => {
        if (!leg) return;
        const side = i % 2 === 0 ? -1 : 1;
        const phase = (i % 3) * 2.1 + (i % 2) * Math.PI;
        leg.rotation.x = moving ? Math.sin(clock.current * 14 + phase) * 0.6 : 0;
        leg.rotation.z = side * (0.5 + tuck * 0.9);
        leg.scale.setScalar(1 - tuck * 0.75);
      });
      if (headRef.current) headRef.current.position.set(0, 0.12 - tuck * 0.12, 0.72 - tuck * 0.32);
      if (body) {
        // 破綻：左右搖晃（看起來暈頭轉向）；前搖時壓低身體準備衝撞
        body.rotation.z = dizzy ? Math.sin(clock.current * 9) * 0.22 : 0;
        body.rotation.x = charge * 0.25;
      }
      v.anim = guarding ? 'guard' : dizzy ? 'recover' : ai.state === 'attack' ? 'windup' : moving ? 'walk' : 'idle';
    }
    if (v.vanishing !== null) v.anim = 'death';
    g.position.set(ai.x, y, ai.z);
    g.rotation.y = ai.yaw;
    g.scale.setScalar(scale * (0.6 + 0.4 * v.fadeIn));
    if (v.vanishing === null) rb.current?.setNextKinematicTranslation({ x: ai.x, y, z: ai.z });
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
          <mesh geometry={shape.body} material={materials.body} castShadow />
          {kind === 'fog_moth' ? (
            // 四片翅膀：左右各前後兩片（左側以鏡像的縮放翻到 -X）
            [
              [0.12, 0.12, 0.05, 1],
              [-0.12, 0.12, 0.05, -1],
              [0.1, 0.05, -0.2, 1],
              [-0.1, 0.05, -0.2, -1],
            ].map(([x, yy, z, side], i) => (
              <group key={i} ref={(o) => void (limbs.current[i] = o)} position={[x!, yy!, z!]}>
                <group scale={[side!, 1, i >= 2 ? 0.75 : 1]} rotation={[0, i >= 2 ? side! * 0.5 : side! * -0.15, 0]}>
                  <mesh geometry={shape.limb} material={materials.wing} />
                  <mesh geometry={shape.extra} material={materials.body} />
                </group>
              </group>
            ))
          ) : (
            <>
              {BEETLE_LEGS.map((p, i) => (
                <group key={i} ref={(o) => void (limbs.current[i] = o)} position={p}>
                  <mesh geometry={shape.limb} material={materials.body} />
                </group>
              ))}
              <mesh ref={headRef} geometry={shape.extra} material={materials.body} position={[0, 0.12, 0.72]} />
            </>
          )}
        </group>
      </group>
    </>
  );
}
