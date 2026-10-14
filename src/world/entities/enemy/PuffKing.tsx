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
 * 霧團噗啾王（任務 7E，Bible §5.5）：灰紫色半透明的果凍狀大噗啾，額頭有不穩定的金色小光點，生氣時身體膨脹、表情仍帶點無辜。
 * 身高約玩家的 1.5 倍。招式的預兆：身體由紫灰轉成亮紫（蓄力約 0.8 秒）——衝撞時地上有一條路線、彈出霧球時落點先出現圈、
 * 膨脹震地時落點圈。被燈塔的光照到時暈眩（頭上轉圈的星星）。倒下時縮成小噗啾、恢復淡紫色後淡出。
 * 同時只有一隻頭目，材質與幾何在模組內共用（預熱與戰鬥用同一份）。
 */
type BossEnemy = EnemyDef & { boss: BossDef };

const BODY_R = 1.25;
const VANISH_SEC = 2.4;
const FADE_IN_SEC = 0.6;
const MAX_ORBS = 8;

const IDLE = new THREE.Color('#9d8fb8');
const ANGRY = new THREE.Color('#b86cff');
const CALM = new THREE.Color('#d9cdf0');
const tmp = new THREE.Color();
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function build() {
  const body = new THREE.IcosahedronGeometry(BODY_R, 4);
  // 底部稍微壓扁、像果凍坐在地上
  const pos = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -0.5) pos.setY(i, -0.5 + (y + 0.5) * 0.45);
  }
  body.computeVertexNormals();
  body.translate(0, BODY_R * 0.78, 0);
  const eye = new THREE.SphereGeometry(0.16, 12, 8);
  eye.scale(0.8, 1.15, 0.5);
  const shine = new THREE.SphereGeometry(0.05, 8, 6);
  const mouth = new THREE.TorusGeometry(0.11, 0.035, 6, 12, Math.PI);
  mouth.rotateZ(Math.PI);
  const gem = new THREE.OctahedronGeometry(0.17, 0);
  const horn = new THREE.ConeGeometry(0.16, 0.42, 8);
  const ring = new THREE.RingGeometry(0.9, 1, 40);
  ring.rotateX(-Math.PI / 2);
  const disc = new THREE.CircleGeometry(1, 40);
  disc.rotateX(-Math.PI / 2);
  const lane = new THREE.PlaneGeometry(1, 1);
  lane.rotateX(-Math.PI / 2);
  lane.translate(0, 0, 0.5);
  const orb = new THREE.IcosahedronGeometry(0.35, 1);
  const star = new THREE.OctahedronGeometry(0.14, 0);
  return { body, eye, shine, mouth, gem, horn, ring, disc, lane, orb, star };
}

function buildMaterials() {
  const body = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: IDLE.clone(), transparent: true, opacity: 0.86, emissive: '#2a2040' }));
  const face = new THREE.MeshBasicMaterial({ color: '#2b2433', transparent: true });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true });
  const gem = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd77a').multiplyScalar(2.2), toneMapped: false, transparent: true });
  const markRing = new THREE.MeshBasicMaterial({ color: '#ffb36b', transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const markFill = new THREE.MeshBasicMaterial({ color: '#ff7a4d', transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  for (const m of [markRing, markFill]) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
  }
  const orb = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#c9b8ff', emissive: '#5a4a8a', transparent: true, opacity: 0.85 }));
  const star = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2a0').multiplyScalar(1.6), toneMapped: false });
  return { body, face, shine, gem, markRing, markFill, orb, star };
}

let shared: { geo: ReturnType<typeof build>; mat: ReturnType<typeof buildMaterials> } | null = null;
function getShared() {
  shared ??= { geo: build(), mat: buildMaterials() };
  return shared;
}

export function PuffKing({ id, def }: { id: string; def: BossEnemy }) {
  const { geo, mat } = getShared();
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const gem = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Group>(null);
  const orbMarks = useRef<THREE.Group>(null);
  const orbBalls = useRef<THREE.Group>(null);
  const slamMark = useRef<THREE.Group>(null);
  const laneMark = useRef<THREE.Mesh>(null);
  const rb = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const ignoredHandle = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (ignoredHandle.current !== null) cameraIgnoredColliders.delete(ignoredHandle.current);
    },
    [],
  );
  const local = useMemo(() => ({ time: 0, prevX: 0, prevZ: 0, wobble: 0 }), []);
  const moves = def.boss.moves;

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
    const t = local.time;
    const st = b.state;
    const timer = b.timer;
    const moved = Math.hypot(ai.x - local.prevX, ai.z - local.prevZ);
    local.prevX = ai.x;
    local.prevZ = ai.z;
    if (!paused && moved > 1e-4) local.wobble += dt * 9;

    // ── 姿勢：彈跳、膨脹、衝刺時拉長 ──
    let lift = 0;
    let sy = 1 + Math.sin(t * 3) * 0.04;
    let sxz = 1 - Math.sin(t * 3) * 0.02;
    let windup = 0;
    switch (st) {
      case 'intro': {
        // 從霧裡鼓起來
        const k = Math.min(1, timer / Math.max(0.1, def.boss.introSec * 0.7));
        sy = easeOut(k) * (1 + Math.sin(k * Math.PI) * 0.15);
        sxz = easeOut(k);
        break;
      }
      case 'chase':
        lift = Math.abs(Math.sin(local.wobble)) * 0.35;
        sy = 1 + Math.sin(local.wobble * 2) * 0.08;
        sxz = 1 - Math.sin(local.wobble * 2) * 0.05;
        break;
      case 'charge':
        windup = timer / (moves.charge?.windup ?? 1);
        sy = 1 - 0.18 * windup;
        sxz = 1 + 0.12 * windup;
        break;
      case 'dash':
        windup = 1;
        sy = 0.85;
        sxz = 1.1;
        break;
      case 'orbs':
        windup = timer / (moves.orbs?.windup ?? 1);
        sy = 1 + 0.12 * windup + Math.sin(t * 30) * 0.03 * windup;
        sxz = 1 + 0.06 * windup;
        break;
      case 'slam': {
        // 蓄力膨脹
        windup = timer / (moves.slam?.windup ?? 1);
        const k = easeOut(Math.min(1, windup));
        sy = 1 + 0.32 * k;
        sxz = 1 + 0.32 * k + Math.sin(t * 40) * 0.02 * k;
        break;
      }
      case 'air': {
        const k = Math.min(1, timer / (moves.slam?.air ?? 1));
        lift = 4 * 2.2 * k * (1 - k);
        sy = 1.3;
        sxz = 1.25;
        windup = 1;
        break;
      }
      case 'recover':
      case 'stunned':
        sy = 0.82 + Math.sin(t * 5) * 0.03;
        sxz = 1.12;
        break;
      default:
        break;
    }

    // 倒下：縮成小噗啾、顏色變回淡紫色，最後淡出
    let opacity = v.fadeIn;
    let shrink = 1;
    let calm = 0;
    if (v.vanishing !== null) {
      if (!paused) v.vanishing += dt;
      const k = Math.min(1, v.vanishing / VANISH_SEC);
      shrink = 1 - 0.7 * easeOut(Math.min(1, k * 1.4));
      calm = Math.min(1, k * 2);
      opacity *= 1 - Math.max(0, (k - 0.7) / 0.3);
      if (k >= 1) {
        removeEnemyVisual(id);
        return;
      }
    }

    const ground = enemyY(ai.x, ai.z);
    g.position.set(ai.x, ground + lift, ai.z);
    g.rotation.y = ai.yaw;
    g.scale.setScalar(shrink);
    body.current?.scale.set(sxz, Math.max(0.01, sy), sxz);
    // 顏色：蓄力時轉亮紫（Bible 攻擊預兆）、被打到閃白、倒下時恢復淡紫
    tmp.copy(IDLE).lerp(ANGRY, Math.min(1, windup)).lerp(CALM, calm);
    mat.body.color.copy(tmp);
    mat.body.emissive.setRGB(0.16 + (v.flash > 0 ? 0.7 : 0), 0.12 + (v.flash > 0 ? 0.7 : 0), 0.25 + (v.flash > 0 ? 0.7 : 0));
    mat.body.opacity = 0.86 * opacity;
    for (const m of [mat.face, mat.shine, mat.gem]) m.opacity = opacity;
    // 額頭不穩定的金色光點：一閃一閃，蓄力時跳得更快
    if (gem.current) {
      const flicker = 0.75 + 0.25 * Math.sin(t * (6 + windup * 20)) + (Math.sin(t * 17.3) > 0.92 ? 0.3 : 0);
      gem.current.scale.setScalar(flicker * (1 - calm * 0.3));
      gem.current.rotation.y = t * 2;
    }
    if (stars.current) {
      stars.current.visible = st === 'stunned' || st === 'recover';
      stars.current.rotation.y = t * 3;
    }

    // ── 預兆 ──
    if (orbMarks.current) {
      orbMarks.current.children.forEach((mark, i) => {
        const m = st === 'orbs' ? b.markers[i] : undefined;
        mark.visible = m !== undefined;
        if (!m || !moves.orbs) return;
        const k = Math.min(1, timer / moves.orbs.windup);
        mark.position.set(m.x, enemyY(m.x, m.z) + 0.06, m.z);
        mark.scale.setScalar(moves.orbs.radius);
        mark.children[1]!.scale.setScalar(Math.max(0.01, k));
      });
    }
    // 霧球從頭頂彈出，沿拋物線落到標記上
    if (orbBalls.current) {
      orbBalls.current.children.forEach((ball, i) => {
        const m = st === 'orbs' ? b.markers[i] : undefined;
        ball.visible = m !== undefined && timer > 0.15;
        if (!m || !moves.orbs) return;
        const k = Math.min(1, Math.max(0, (timer - 0.15) / (moves.orbs.windup - 0.15)));
        const sx = ai.x;
        const sz = ai.z;
        const top = ground + BODY_R * 2;
        ball.position.set(sx + (m.x - sx) * k, top + (enemyY(m.x, m.z) + 0.3 - top) * k + 4 * k * (1 - k) * 3, sz + (m.z - sz) * k);
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
    if (laneMark.current) {
      const show = st === 'charge';
      laneMark.current.visible = show;
      if (show && moves.charge) {
        const k = Math.min(1, timer / moves.charge.windup);
        laneMark.current.position.set(ai.x, ground + 0.08, ai.z);
        laneMark.current.rotation.y = ai.yaw;
        laneMark.current.scale.set(moves.charge.radius * 2, 1, moves.charge.distance * (0.3 + 0.7 * k));
      }
    }

    const center = ground + lift + BODY_R * 0.78 * shrink;
    if (v.vanishing === null) rb.current?.setNextKinematicTranslation({ x: ai.x, y: center, z: ai.z });
    else rb.current?.setNextKinematicTranslation({ x: ai.x, y: -100, z: ai.z });
  });

  const v = enemyRuntime.get(id);
  const start: [number, number, number] = v ? [v.ai.x, enemyY(v.ai.x, v.ai.z), v.ai.z] : [0, -100, 0];
  const faceY = BODY_R * 0.95;
  const faceZ = BODY_R * 0.99;
  return (
    <>
      <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={start}>
        <BallCollider ref={collider} args={[BODY_R]} />
      </RigidBody>
      <group ref={group} position={start} name={`enemy:${id}`}>
        <group ref={body}>
          <mesh geometry={geo.body} material={mat.body} castShadow />
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh geometry={geo.eye} material={mat.face} position={[side * 0.36, faceY, faceZ]} />
              <mesh geometry={geo.shine} material={mat.shine} position={[side * 0.36 + 0.05, faceY + 0.07, faceZ + 0.07]} />
              {/* 軟軟的小角 */}
              <mesh geometry={geo.horn} material={mat.body} position={[side * 0.55, BODY_R * 1.78, 0.1]} rotation={[0.2, 0, -side * 0.45]} />
            </group>
          ))}
          <mesh geometry={geo.mouth} material={mat.face} position={[0, faceY - 0.3, faceZ + 0.02]} />
          <mesh ref={gem} geometry={geo.gem} material={mat.gem} position={[0, BODY_R * 1.32, BODY_R * 0.88]} />
        </group>
        <group ref={stars} position={[0, BODY_R * 2.2, 0]} visible={false}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={geo.star} material={mat.star} position={[Math.cos((i / 3) * Math.PI * 2) * 0.7, 0, Math.sin((i / 3) * Math.PI * 2) * 0.7]} />
          ))}
        </group>
      </group>
      <group ref={orbMarks}>
        {Array.from({ length: MAX_ORBS }, (_, i) => (
          <group key={i} visible={false}>
            <mesh geometry={geo.ring} material={mat.markRing} renderOrder={2} />
            <mesh geometry={geo.disc} material={mat.markFill} renderOrder={2} />
          </group>
        ))}
      </group>
      <group ref={orbBalls}>
        {Array.from({ length: MAX_ORBS }, (_, i) => (
          <mesh key={i} geometry={geo.orb} material={mat.orb} visible={false} />
        ))}
      </group>
      <group ref={slamMark} visible={false}>
        <mesh geometry={geo.ring} material={mat.markRing} renderOrder={2} />
        <mesh geometry={geo.disc} material={mat.markFill} renderOrder={2} />
      </group>
      <mesh ref={laneMark} geometry={geo.lane} material={mat.markFill} visible={false} renderOrder={2} />
    </>
  );
}

/** shader 預熱用：每種材質各畫一次；材質是模組共用的，不會在卸載時釋放 */
export function PuffKingWarmup() {
  const { geo, mat } = getShared();
  return (
    <>
      <mesh geometry={geo.body} material={mat.body} castShadow />
      <mesh geometry={geo.eye} material={mat.face} />
      <mesh geometry={geo.shine} material={mat.shine} />
      <mesh geometry={geo.gem} material={mat.gem} />
      <mesh geometry={geo.ring} material={mat.markRing} />
      <mesh geometry={geo.disc} material={mat.markFill} />
      <mesh geometry={geo.orb} material={mat.orb} />
      <mesh geometry={geo.star} material={mat.star} />
    </>
  );
}

let buddyMaterials: { body: THREE.Material; face: THREE.Material; shine: THREE.Material; gem: THREE.Material } | null = null;

/** 小噗啾自己的材質（頭目的共用材質在倒下時會被調成透明） */
function getBuddyMaterials() {
  buddyMaterials ??= {
    body: patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: CALM, transparent: true, opacity: 0.9 })),
    face: new THREE.MeshBasicMaterial({ color: '#2b2433' }),
    shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    gem: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd77a').multiplyScalar(1.6), toneMapped: false }),
  };
  return buddyMaterials;
}

/**
 * 戰後的小噗啾（任務 7E，Bible §5.5：縮小並恢復淡紫色，逃到村外成為可選擇照顧的生物）。NPC 系統的程式造型。
 * 待機時軟軟地彈；說話時跳兩下。
 */
export function PuffBuddy({ talking }: { talking: () => boolean }) {
  const { geo } = getShared();
  const mat = getBuddyMaterials();
  const body = useRef<THREE.Group>(null);
  const local = useMemo(() => ({ time: 0, hop: 0 }), []);
  useFrame((_, rawDt) => {
    if (currentScreen() === 'paused') return;
    const dt = Math.min(rawDt, 1 / 20);
    local.time += dt;
    local.hop = talking() ? local.hop + dt : 0;
    const b = body.current;
    if (!b) return;
    const squish = Math.sin(local.time * 3);
    b.scale.set(1 - squish * 0.04, 1 + squish * 0.06, 1 - squish * 0.04);
    b.position.y = local.hop > 0 ? Math.abs(Math.sin(local.hop * 8)) * 0.6 : 0;
  });
  const faceY = BODY_R * 0.95;
  const faceZ = BODY_R * 0.99;
  return (
    <group ref={body}>
      <mesh geometry={geo.body} material={mat.body} castShadow />
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh geometry={geo.eye} material={mat.face} position={[side * 0.36, faceY, faceZ]} />
          <mesh geometry={geo.shine} material={mat.shine} position={[side * 0.36 + 0.05, faceY + 0.07, faceZ + 0.07]} />
          <mesh geometry={geo.horn} material={mat.body} position={[side * 0.55, BODY_R * 1.78, 0.1]} rotation={[0.2, 0, -side * 0.45]} />
        </group>
      ))}
      <mesh geometry={geo.mouth} material={mat.face} position={[0, faceY - 0.3, faceZ + 0.02]} />
      <mesh geometry={geo.gem} material={mat.gem} position={[0, BODY_R * 1.32, BODY_R * 0.88]} scale={0.6} />
    </group>
  );
}
