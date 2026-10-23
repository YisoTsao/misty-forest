import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { EnemyDef } from '@/game-core/combat/combat';
import { combat } from '@/game/authority';
import { enemyRuntime, enemyY, removeEnemyVisual, useEnemyListStore } from '@/game/combat/combatRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { assetUrl } from '@/game/worldData';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import { createWispMaterial, wispEyeMaterial } from '@/render/mistWisp';
import { updateEnemyAi } from './enemyUpdate';
import { ModelEnemy, ModelEnemyWarmup } from './ModelEnemy';
import { CritterEnemy, CritterEnemyWarmup } from './CritterEnemy';
import { LakeCritter, LakeCritterWarmup, type LakeKind } from './LakeCritter';
import { LiyiKoi, LiyiKoiWarmup } from './LiyiKoi';
import { PuffKing, PuffKingWarmup } from './PuffKing';
import { clearSpits, stepSpits } from '@/game/combat/enemySpits';
import { isControllable } from '@/game-core/flow/gameFlow';

/** 身體浮在地面上方的高度（身體中心） */
const HOVER = 1.05;
const BODY_RADIUS = 0.5;
const VANISH_SEC = 0.9;
const FADE_IN_SEC = 1.2;

/** 所有怪物模型的路徑：場景載入時一起載入，之後生成新怪物不會觸發 Suspense 讓世界閃爍 */
const MODEL_URLS = [...new Set([...combat.enemies.values()].flatMap((e) => (e.model ? [assetUrl(e.model.path)] : [])))];

/**
 * 敵人（規格 6.6、任務 7C）：位置與 AI 在本機模擬，出手與受傷交給權威層判定。
 * 有模型的敵人以骨架動畫模型呈現（ModelEnemy），迷霧噗啾是程式產生的霧團。
 */
export function Enemies() {
  const ids = useEnemyListStore((s) => s.ids);
  useGLTF(MODEL_URLS);
  const shared = useMemo(
    () => ({
      body: new THREE.IcosahedronGeometry(BODY_RADIUS, 3),
      eye: new THREE.SphereGeometry(0.075, 12, 8),
      puff: new THREE.IcosahedronGeometry(0.2, 2),
    }),
    [],
  );
  useEffect(
    () => () => {
      shared.body.dispose();
      shared.eye.dispose();
      shared.puff.dispose();
    },
    [shared],
  );
  // 迷霧芽怪的泥團：遊玩中才飛，回到主選單時清掉
  useFrame((_, dt) => {
    const screen = currentScreen();
    if (screen === 'title') clearSpits();
    else if (isControllable(screen)) stepSpits(Math.min(dt, 1 / 20));
  });
  return (
    <>
      <EnemyShaderWarmup geometry={shared} />
      {ids.map((id) => {
        const def = combat.enemies.get(enemyRuntime.get(id)?.kind ?? '');
        if (def?.boss) {
          const boss = { ...def, boss: def.boss };
          if (def.id === 'boss_liyi_echo_koi') return <LiyiKoi key={id} id={id} def={boss} />;
          // 其他頭目（第二章的根噬者）在各自的任務加入元件
          return def.id === 'boss_dawn_mist_puff' ? <PuffKing key={id} id={id} def={boss} /> : null;
        }
        if (def?.model) return <ModelEnemy key={id} id={id} def={{ ...def, model: def.model }} />;
        if (def?.procedural) {
          const kind = def.procedural;
          return isLakeKind(kind) ? <LakeCritter key={id} id={id} def={{ ...def, procedural: kind }} /> : <CritterEnemy key={id} id={id} def={{ ...def, procedural: kind }} />;
        }
        return <MistWisp key={id} id={id} geometry={shared} />;
      })}
    </>
  );
}

/** 澄鏡湖的程式造型怪物（任務 9B）另有元件 */
function isLakeKind(kind: NonNullable<EnemyDef['procedural']>): kind is LakeKind {
  return kind === 'bubble_wisp' || kind === 'bubble_wisp_small' || kind === 'mist_heron' || kind === 'mirror_crab';
}

/** 預熱幾幀後卸載（ShaderWarmup 在第一幀就畫過了，多留幾幀保險） */
const WARMUP_FRAMES = 10;

/**
 * 每種怪物各放一份隱藏的模型，讓 ShaderWarmup 在載入時一起編譯它們的 shader（含陰影）。
 * 怪物是靠近生成點才生成的，沒有預熱時第一次遇到每一種都會卡 40–260 ms。
 */
function EnemyShaderWarmup({ geometry }: { geometry: { body: THREE.BufferGeometry; eye: THREE.BufferGeometry } }) {
  const [done, setDone] = useState(false);
  const frames = useRef(0);
  // 不 dispose：留著材質，預熱編好的 program 才不會在卸載時被刪掉（見 ModelEnemyWarmup）
  const wisp = useMemo(() => createWispMaterial(0).material, []);
  useFrame(() => {
    if (!done && ++frames.current > WARMUP_FRAMES) setDone(true);
  });
  if (done) return null;
  return (
    <group visible={false} name="enemy-shader-warmup">
      {[...combat.enemies.values()].map((def) => {
        if (def.model) return <ModelEnemyWarmup key={def.id} def={{ ...def, model: def.model }} />;
        const kind = def.procedural;
        if (kind) return isLakeKind(kind) ? <LakeCritterWarmup key={def.id} kind={kind} /> : <CritterEnemyWarmup key={def.id} kind={kind} />;
        if (def.boss && def.id === 'boss_liyi_echo_koi') return <LiyiKoiWarmup key={def.id} />;
        if (def.boss) return def.id === 'boss_dawn_mist_puff' ? <PuffKingWarmup key={def.id} /> : null;
        return null;
      })}
      <mesh geometry={geometry.body} material={wisp} castShadow />
      <mesh geometry={geometry.eye} material={wispEyeMaterial()} />
    </group>
  );
}

function MistWisp({ id, geometry }: { id: string; geometry: { body: THREE.BufferGeometry; eye: THREE.BufferGeometry; puff: THREE.BufferGeometry } }) {
  const group = useRef<THREE.Group>(null);
  const puffs = useRef<THREE.Group>(null);
  const rb = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  // 每隻的蠕動相位不同：由 id 算出固定的種子（render 必須是純函式）
  const seed = useMemo(() => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7) / 100, [id]);
  const { material, uniforms } = useMemo(() => createWispMaterial(seed), [seed]);
  useEffect(() => () => material.dispose(), [material]);
  // 碰撞體擋住玩家，但不把攝影機拉近（碰撞體在物理初始化後才有 handle，於第一次更新時登記）
  const ignoredHandle = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (ignoredHandle.current !== null) cameraIgnoredColliders.delete(ignoredHandle.current);
    },
    [],
  );

  useFrame(({ camera }, rawDt) => {
    const v = enemyRuntime.get(id);
    const g = group.current;
    if (!v || !g) return;
    // 遠處的迷霧噗啾不畫（與模型怪物相同的距離）
    g.visible = Math.hypot(camera.position.x - v.ai.x, camera.position.z - v.ai.z) < 90;
    if (ignoredHandle.current === null && collider.current) {
      ignoredHandle.current = collider.current.handle;
      cameraIgnoredColliders.add(ignoredHandle.current);
    }
    const def = combat.enemies.get(v.kind);
    const spawner = combat.spawners.find((s) => s.id === v.spawner);
    if (!def || !spawner) return;
    const dt = Math.min(rawDt, 1 / 20);
    const paused = currentScreen() === 'paused';
    if (!paused) uniforms.uTime.value += dt;
    const ai = v.ai;
    updateEnemyAi(id, v, def, spawner, dt);

    // 表現：淡入、閃白、攻擊前搖、消失
    if (!paused) {
      v.fadeIn = Math.min(1, v.fadeIn + dt / FADE_IN_SEC);
      v.flash = Math.max(0, v.flash - dt);
    }
    let scale = 1;
    let rise = 0;
    let opacity = v.fadeIn;
    if (v.vanishing !== null) {
      if (!paused) v.vanishing += dt;
      const t = Math.min(1, v.vanishing / VANISH_SEC);
      scale = 1 + t * 0.4;
      rise = t * 0.8;
      opacity *= 1 - t;
      if (t >= 1) {
        removeEnemyVisual(id);
        return;
      }
    }
    uniforms.uFlash.value = v.flash > 0 ? 0.9 : 0;
    uniforms.uOpacity.value = opacity;
    uniforms.uCharge.value = ai.state === 'attack' ? Math.min(1, ai.timer / Math.max(def.attackWindup, 0.01)) : 0;

    const bob = Math.sin(uniforms.uTime.value * 2 + seed) * 0.12;
    const y = enemyY(ai.x, ai.z) + HOVER + bob + rise;
    g.position.set(ai.x, y, ai.z);
    g.rotation.y = ai.yaw;
    g.scale.setScalar(scale * (0.6 + 0.4 * v.fadeIn));
    // 霧尾：幾團小霧在身後上下飄
    puffs.current?.children.forEach((p, i) => {
      p.position.set(Math.sin(uniforms.uTime.value * 1.5 + i * 2.1 + seed) * 0.18, -0.45 - i * 0.18, -0.25 - i * 0.22);
      p.scale.setScalar(1 - i * 0.22);
    });
    if (v.vanishing === null) rb.current?.setNextKinematicTranslation({ x: ai.x, y, z: ai.z });
    else rb.current?.setNextKinematicTranslation({ x: ai.x, y: -100, z: ai.z });
  });

  const v = enemyRuntime.get(id);
  const start: [number, number, number] = v ? [v.ai.x, enemyY(v.ai.x, v.ai.z) + HOVER, v.ai.z] : [0, -100, 0];
  return (
    <>
      <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={start}>
        <BallCollider ref={collider} args={[BODY_RADIUS * 0.9]} />
      </RigidBody>
      <group ref={group} position={start} name={`enemy:${id}`}>
        <mesh geometry={geometry.body} material={material} castShadow />
        <mesh geometry={geometry.eye} material={wispEyeMaterial()} position={[-0.17, 0.08, 0.43]} />
        <mesh geometry={geometry.eye} material={wispEyeMaterial()} position={[0.17, 0.08, 0.43]} />
        <group ref={puffs}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={geometry.puff} material={material} />
          ))}
        </group>
      </group>
    </>
  );
}
