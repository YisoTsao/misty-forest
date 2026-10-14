import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BossDef, EnemyDef } from '@/game-core/combat/combat';
import { updateBossAi } from '@/game/combat/bossRuntime';
import { enemyRuntime, enemyY, removeEnemyVisual } from '@/game/combat/combatRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import { patchMist } from '@/render/mist';
import { toonGradient } from '@/render/toon';

/**
 * 璃漪，回聲鯉龍（任務 9E，Bible §7.5）：漂浮的大錦鯉龍，珍珠白與湖藍的身體、半透明絲綢般的鰭、身上有環狀的星光紋，
 * 長約玩家的 4–5 倍（約 8 m），在水鏡神殿的石台上方游動（固定的舞台，攝影機不必追巨大的模型）。
 * 招式與預兆（Bible：水面先出現圓形波紋，約 0.5–0.8 秒後才攻擊）：
 * - 水柱（spikes）：玩家腳下與周圍出現藍色波紋圈，時間到時水柱衝起
 * - 回聲波（spores）：身前的扇形波紋，吹出一圈回聲，打中會頭昏（變慢）
 * - 尾部水浪（slam）：躍出水面、落點出現波紋圈，落下時濺起水浪；之後在石台上喘氣（破綻）
 * 倒影：兩隻半透明的分身跟在兩側（只有真身會在水面留下波紋）；被水鏡照到時分身散去、真身發光（暈眩，Bible：令真身短暫顯形）。
 * 同時只有一隻頭目，材質與幾何在模組內共用（預熱與戰鬥用同一份）。
 */
type BossEnemy = EnemyDef & { boss: BossDef };

const SEGMENTS = 9;
/** 身體各節的半徑（頭 → 尾） */
const RADII = [0.95, 1.05, 1.0, 0.9, 0.78, 0.64, 0.5, 0.36, 0.24];
const SEG_GAP = 0.85;
/** 漂浮高度（身體中心離地） */
const HOVER = 2.2;
const VANISH_SEC = 2.6;
const FADE_IN_SEC = 1.4;
const COLUMN_LIFE = 1.1;
const MAX_COLUMNS = 8;
const PEARL = new THREE.Color('#f4f1ea');
const LAKE = new THREE.Color('#77c9df');
const GLOW = new THREE.Color('#bff0ff');
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function colored(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position!.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** 扇形（回聲波的範圍）：中心在原點、朝 +Z */
function sector(arcDeg: number): THREE.BufferGeometry {
  const arc = (arcDeg * Math.PI) / 180;
  const g = new THREE.CircleGeometry(1, 24, Math.PI / 2 - arc / 2, arc);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI);
  return g;
}

function build() {
  // 身體一節：珍珠白的球，背上一塊湖藍斑
  const seg = colored(new THREE.IcosahedronGeometry(1, 2), PEARL);
  const patch = colored(new THREE.IcosahedronGeometry(1, 1).scale(0.7, 0.35, 0.8).translate(0, 0.72, 0), LAKE);
  // 頭：吻部、眼睛、長鬚
  const head = new THREE.IcosahedronGeometry(1, 2);
  head.scale(0.95, 0.85, 1.25);
  const eye = new THREE.SphereGeometry(0.16, 10, 8);
  const whisker = new THREE.CylinderGeometry(0.03, 0.01, 1.6, 5);
  whisker.translate(0, -0.8, 0);
  // 鰭：半透明的絲綢（扇形面片）
  const fin = new THREE.CircleGeometry(1.3, 16, -0.6, 1.4);
  fin.rotateY(Math.PI / 2);
  const tail = new THREE.CircleGeometry(1.6, 18, Math.PI * 0.62, Math.PI * 0.76);
  tail.rotateX(Math.PI / 2);
  tail.rotateY(Math.PI / 2);
  // 環狀星光紋
  const ring = new THREE.TorusGeometry(1, 0.06, 4, 28);
  ring.rotateY(Math.PI / 2);
  // 地面預兆：波紋圈
  const markRing = new THREE.RingGeometry(0.88, 1, 40);
  markRing.rotateX(-Math.PI / 2);
  const markDisc = new THREE.CircleGeometry(1, 40);
  markDisc.rotateX(-Math.PI / 2);
  const column = new THREE.CylinderGeometry(0.55, 0.75, 3.2, 12, 1, true);
  column.translate(0, 1.6, 0);
  const star = new THREE.OctahedronGeometry(0.2, 0);
  return { seg, patch, head, eye, whisker, fin, tail, ring, markRing, markDisc, column, star, sector: sector(90) };
}

function buildMaterials() {
  const body = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, transparent: true, emissive: '#1a3440' }));
  const decoy = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe6f0'), transparent: true, opacity: 0.28, depthWrite: false });
  const fin = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfefff'), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const eye = new THREE.MeshBasicMaterial({ color: '#1f2a3a', transparent: true });
  const glow = new THREE.MeshBasicMaterial({ color: GLOW.clone().multiplyScalar(1.8), toneMapped: false, transparent: true });
  const markRing = new THREE.MeshBasicMaterial({ color: '#9fe6ff', transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const markFill = new THREE.MeshBasicMaterial({ color: '#4fb4e0', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  for (const m of [markRing, markFill]) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
  }
  const water = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d9f4ff').multiplyScalar(1.2), transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const star = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2a0').multiplyScalar(1.6), toneMapped: false });
  return { body, decoy, fin, eye, glow, markRing, markFill, water, star };
}

let shared: { geo: ReturnType<typeof build>; mat: ReturnType<typeof buildMaterials> } | null = null;
function getShared() {
  shared ??= { geo: build(), mat: buildMaterials() };
  return shared;
}

/** 一隻錦鯉龍的身體（真身與倒影共用造型）：segments 依游動波形擺動 */
function KoiBody({ segRefs, material, finMaterial, glowMaterial, eyeMaterial }: { segRefs: React.MutableRefObject<(THREE.Group | null)[]>; material: THREE.Material; finMaterial: THREE.Material; glowMaterial: THREE.Material; eyeMaterial: THREE.Material }) {
  const { geo } = getShared();
  return (
    <>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <group key={i} ref={(o) => void (segRefs.current[i] = o)}>
          {i === 0 ? (
            <>
              <mesh geometry={geo.head} material={material} scale={RADII[0]} castShadow />
              {[-1, 1].map((side) => (
                <group key={side}>
                  <mesh geometry={geo.eye} material={eyeMaterial} position={[side * 0.55, 0.25, 0.85]} />
                  <mesh geometry={geo.whisker} material={finMaterial} position={[side * 0.35, -0.15, 1.05]} rotation={[-1.1, 0, side * 0.5]} />
                </group>
              ))}
            </>
          ) : (
            <>
              <mesh geometry={geo.seg} material={material} scale={RADII[i]} castShadow />
              <mesh geometry={geo.patch} material={material} scale={RADII[i]} />
            </>
          )}
          {/* 胸鰭、背鰭、尾鰭 */}
          {i === 2 && [-1, 1].map((side) => <mesh key={side} geometry={geo.fin} material={finMaterial} position={[side * 0.9, -0.2, 0]} rotation={[0, 0, side * 1.1]} />)}
          {i === 4 && <mesh geometry={geo.fin} material={finMaterial} position={[0, 0.85, 0]} scale={0.8} />}
          {i === SEGMENTS - 1 && <mesh geometry={geo.tail} material={finMaterial} position={[0, 0, -0.3]} />}
          {/* 環狀星光紋 */}
          {(i === 1 || i === 3 || i === 5) && <mesh geometry={geo.ring} material={glowMaterial} scale={RADII[i]! * 1.02} />}
        </group>
      ))}
    </>
  );
}

export function LiyiKoi({ id, def }: { id: string; def: BossEnemy }) {
  const { geo, mat } = getShared();
  const group = useRef<THREE.Group>(null);
  const segs = useRef<(THREE.Group | null)[]>([]);
  const decoySegs = [useRef<(THREE.Group | null)[]>([]), useRef<(THREE.Group | null)[]>([])];
  const decoys = useRef<THREE.Group>(null);
  const stars = useRef<THREE.Group>(null);
  const columnMarks = useRef<THREE.Group>(null);
  const columns = useRef<THREE.Group>(null);
  const slamMark = useRef<THREE.Group>(null);
  const waveMark = useRef<THREE.Mesh>(null);
  const ripple = useRef<THREE.Mesh>(null);
  const rb = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const ignoredHandle = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (ignoredHandle.current !== null) cameraIgnoredColliders.delete(ignoredHandle.current);
    },
    [],
  );
  const local = useMemo(() => ({ time: 0, prevState: '', swim: 0, prevX: 0, prevZ: 0, reveal: 0, columns: [] as { x: number; z: number; y: number; age: number }[] }), []);
  const moves = def.boss.moves;

  useFrame(({ camera }, rawDt) => {
    const v = enemyRuntime.get(id);
    const g = group.current;
    const b = v?.boss;
    if (!v || !b || !g) return;
    g.visible = Math.hypot(camera.position.x - v.ai.x, camera.position.z - v.ai.z) < 140;
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
    const t = local.time;
    const st = b.state;
    const timer = b.timer;
    const moved = Math.hypot(ai.x - local.prevX, ai.z - local.prevZ);
    local.prevX = ai.x;
    local.prevZ = ai.z;
    if (!paused) local.swim += dt * (moved > 1e-4 ? 4 : 1.6);
    // 水柱：標記結束時衝起
    if (local.prevState === 'spikes' && st !== 'spikes') {
      for (const m of b.markers) local.columns.push({ x: m.x, z: m.z, y: enemyY(m.x, m.z), age: 0 });
      while (local.columns.length > MAX_COLUMNS) local.columns.shift();
    }
    local.prevState = st;

    // ── 姿勢 ──
    let lift = Math.sin(t * 1.3) * 0.25;
    let windup = 0;
    let curl = 0;
    switch (st) {
      case 'intro': {
        // 從水面下升起
        const k = Math.min(1, timer / Math.max(0.1, def.boss.introSec * 0.8));
        lift = -HOVER * (1 - easeOut(k));
        break;
      }
      case 'spikes':
        windup = timer / (moves.spikes?.windup ?? 1);
        curl = 0.4 * windup;
        break;
      case 'spores':
        windup = timer / (moves.spores?.windup ?? 1);
        lift -= 0.4 * windup;
        break;
      case 'slam':
        windup = timer / (moves.slam?.windup ?? 1);
        lift -= 0.8 * easeOut(Math.min(1, windup));
        curl = -0.5 * windup;
        break;
      case 'air': {
        const k = Math.min(1, timer / (moves.slam?.air ?? 1));
        lift = 4 * 3.5 * k * (1 - k);
        windup = 1;
        curl = 0.6 * Math.sin(k * Math.PI);
        break;
      }
      case 'recover':
      case 'stunned':
        lift = -0.9 + Math.sin(t * 4) * 0.1;
        break;
      default:
        break;
    }
    // 顯形（暈眩）時倒影散去
    const revealed = st === 'stunned' || st === 'recover';
    local.reveal += ((revealed ? 1 : 0) - local.reveal) * Math.min(1, dt * 4);

    let opacity = v.fadeIn;
    let calm = 0;
    if (v.vanishing !== null) {
      if (!paused) v.vanishing += dt;
      const k = Math.min(1, v.vanishing / VANISH_SEC);
      calm = Math.min(1, k * 2);
      lift = -HOVER * 0.6 * easeOut(k);
      opacity *= 1 - Math.max(0, (k - 0.6) / 0.4);
      if (k >= 1) {
        removeEnemyVisual(id);
        return;
      }
    }

    const ground = enemyY(ai.x, ai.z);
    g.position.set(ai.x, ground + HOVER + lift, ai.z);
    g.rotation.y = ai.yaw;
    // 身體各節沿著游動的波形排開（頭在前 +Z），蓄力時捲起來
    const place = (list: (THREE.Group | null)[], phase: number) => {
      list.forEach((s, i) => {
        if (!s) return;
        const k = i / (SEGMENTS - 1);
        const wave = Math.sin(local.swim * 2.2 - i * 0.7 + phase) * (0.25 + k * 0.9);
        s.position.set(wave + Math.sin(k * Math.PI) * curl * 2, Math.sin(i * 0.5 + t) * 0.12 + curl * k * k * 2.5, -i * SEG_GAP * (1 - Math.abs(curl) * 0.3));
        s.rotation.y = Math.cos(local.swim * 2.2 - i * 0.7 + phase) * 0.35;
      });
    };
    place(segs.current, 0);
    place(decoySegs[0]!.current, 1.3);
    place(decoySegs[1]!.current, 2.6);
    if (decoys.current) {
      decoys.current.visible = local.reveal < 0.98 && v.vanishing === null && st !== 'intro';
      decoys.current.children.forEach((d, i) => {
        const side = i === 0 ? -1 : 1;
        d.position.set(side * (3.6 + Math.sin(t * 0.8 + i) * 0.5), Math.sin(t * 1.1 + i) * 0.3, -1 + Math.cos(t * 0.7 + i));
      });
    }
    mat.decoy.opacity = 0.28 * (1 - local.reveal) * opacity;
    // 顏色：蓄力時發亮（Bible：攻擊前兆）、被打到閃白、顯形時整隻發光
    const e = (v.flash > 0 ? 0.6 : 0) + windup * 0.25 + local.reveal * 0.35;
    mat.body.emissive.setRGB(0.1 + e, 0.2 + e, 0.25 + e);
    mat.body.opacity = (0.55 + 0.45 * Math.max(local.reveal, calm)) * opacity;
    mat.fin.opacity = 0.55 * opacity;
    mat.eye.opacity = opacity;
    mat.glow.opacity = opacity;
    if (stars.current) {
      stars.current.visible = st === 'stunned';
      stars.current.rotation.y = t * 3;
    }
    // 真身下方的水面波紋（Bible：觀察真身與倒影的波紋差異）
    if (ripple.current) {
      const r = (t * 0.8) % 1;
      ripple.current.visible = v.vanishing === null;
      ripple.current.position.set(ai.x, ground + 0.08, ai.z);
      ripple.current.scale.setScalar(1.5 + r * 3.5);
      (ripple.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - r);
    }

    // ── 預兆 ──
    if (columnMarks.current) {
      columnMarks.current.children.forEach((mark, i) => {
        const m = st === 'spikes' ? b.markers[i] : undefined;
        mark.visible = m !== undefined;
        if (!m || !moves.spikes) return;
        const k = Math.min(1, timer / moves.spikes.windup);
        mark.position.set(m.x, enemyY(m.x, m.z) + 0.06, m.z);
        mark.scale.setScalar(moves.spikes.radius * (1 + Math.sin(t * 12) * 0.04));
        mark.children[1]!.scale.setScalar(Math.max(0.01, k));
      });
    }
    if (slamMark.current) {
      const show = st === 'slam' || st === 'air';
      slamMark.current.visible = show;
      if (show && moves.slam) {
        const k = st === 'slam' ? 0.5 * (timer / moves.slam.windup) : 0.5 + 0.5 * Math.min(1, timer / moves.slam.air);
        slamMark.current.position.set(b.slamTo.x, enemyY(b.slamTo.x, b.slamTo.z) + 0.07, b.slamTo.z);
        slamMark.current.scale.setScalar(moves.slam.radius);
        slamMark.current.children[1]!.scale.setScalar(Math.max(0.01, k));
      }
    }
    if (waveMark.current) {
      waveMark.current.visible = st === 'spores';
      if (st === 'spores' && moves.spores) {
        const k = Math.min(1, timer / moves.spores.windup);
        waveMark.current.position.set(ai.x, ground + 0.08, ai.z);
        waveMark.current.rotation.y = ai.yaw;
        waveMark.current.scale.setScalar(moves.spores.range * (0.3 + 0.7 * k));
      }
    }
    if (columns.current) {
      for (const c of local.columns) if (!paused) c.age += dt;
      local.columns = local.columns.filter((c) => c.age < COLUMN_LIFE);
      columns.current.children.forEach((mesh, i) => {
        const c = local.columns[i];
        mesh.visible = c !== undefined;
        if (!c) return;
        const up = Math.min(1, c.age / 0.15);
        const down = Math.max(0, (c.age - 0.6) / (COLUMN_LIFE - 0.6));
        mesh.position.set(c.x, c.y - 0.1, c.z);
        mesh.scale.set(1, Math.max(0.01, easeOut(up) * (1 - down)), 1);
      });
    }

    const center = ground + HOVER + lift;
    if (v.vanishing === null) rb.current?.setNextKinematicTranslation({ x: ai.x, y: center, z: ai.z });
    else rb.current?.setNextKinematicTranslation({ x: ai.x, y: -100, z: ai.z });
  });

  const v = enemyRuntime.get(id);
  const start: [number, number, number] = v ? [v.ai.x, enemyY(v.ai.x, v.ai.z), v.ai.z] : [0, -100, 0];
  const rippleMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#e8fbff', transparent: true, depthWrite: false, side: THREE.DoubleSide }), []);
  useEffect(() => () => rippleMat.dispose(), [rippleMat]);
  return (
    <>
      <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={start}>
        <BallCollider ref={collider} args={[def.boss.bodyRadius]} />
      </RigidBody>
      <group ref={group} position={start} name={`enemy:${id}`}>
        <KoiBody segRefs={segs} material={mat.body} finMaterial={mat.fin} glowMaterial={mat.glow} eyeMaterial={mat.eye} />
        <group ref={decoys}>
          {[0, 1].map((i) => (
            <group key={i}>
              <KoiBody segRefs={decoySegs[i]!} material={mat.decoy} finMaterial={mat.decoy} glowMaterial={mat.decoy} eyeMaterial={mat.decoy} />
            </group>
          ))}
        </group>
        <group ref={stars} position={[0, 1.8, 0]} visible={false}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={geo.star} material={mat.star} position={[Math.cos((i / 3) * Math.PI * 2) * 1.1, 0, Math.sin((i / 3) * Math.PI * 2) * 1.1]} />
          ))}
        </group>
      </group>
      <mesh ref={ripple} geometry={geo.markRing} material={rippleMat} renderOrder={2} />
      <group ref={columnMarks}>
        {Array.from({ length: Math.max(moves.spikes?.count ?? 0, moves.spikes?.count2 ?? 0) }, (_, i) => (
          <group key={i} visible={false}>
            <mesh geometry={geo.markRing} material={mat.markRing} renderOrder={2} />
            <mesh geometry={geo.markDisc} material={mat.markFill} renderOrder={2} />
          </group>
        ))}
      </group>
      <group ref={slamMark} visible={false}>
        <mesh geometry={geo.markRing} material={mat.markRing} renderOrder={2} />
        <mesh geometry={geo.markDisc} material={mat.markFill} renderOrder={2} />
      </group>
      <mesh ref={waveMark} geometry={geo.sector} material={mat.markFill} visible={false} renderOrder={2} />
      <group ref={columns}>
        {Array.from({ length: MAX_COLUMNS }, (_, i) => (
          <mesh key={i} geometry={geo.column} material={mat.water} visible={false} />
        ))}
      </group>
    </>
  );
}

/** shader 預熱用：每種材質各畫一次；材質是模組共用的，不會在卸載時釋放 */
export function LiyiKoiWarmup() {
  const { geo, mat } = getShared();
  return (
    <>
      <mesh geometry={geo.seg} material={mat.body} castShadow />
      <mesh geometry={geo.seg} material={mat.decoy} />
      <mesh geometry={geo.fin} material={mat.fin} />
      <mesh geometry={geo.eye} material={mat.eye} />
      <mesh geometry={geo.ring} material={mat.glow} />
      <mesh geometry={geo.markRing} material={mat.markRing} />
      <mesh geometry={geo.markDisc} material={mat.markFill} />
      <mesh geometry={geo.column} material={mat.water} />
      <mesh geometry={geo.star} material={mat.star} />
    </>
  );
}
