import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { aiUpdateInterval, stepEnemyAi } from '@/game-core/combat/enemyAi';
import { isControllable } from '@/game-core/flow/gameFlow';
import { authority, combat } from '@/game/authority';
import { combatRuntime, enemyRuntime, enemyY, removeEnemyVisual, useEnemyListStore } from '@/game/combat/combatRuntime';
import { playerRuntime } from '@/game/player/localRuntime';
import { useDebugStore } from '@/game/state/debugStore';
import { currentScreen } from '@/game/state/gameStore';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import { createWispMaterial, wispEyeMaterial } from '@/render/mistWisp';

/** 身體浮在地面上方的高度（身體中心） */
const HOVER = 1.05;
const BODY_RADIUS = 0.5;
const VANISH_SEC = 0.9;
const FADE_IN_SEC = 1.2;
/** 出手時玩家還在這個距離內才算命中（給攻擊距離一點寬容） */
const STRIKE_SLACK = 0.45;

/** 迷霧生物（規格 6.6）：位置與 AI 在本機模擬，出手與受傷交給權威層判定。 */
export function Enemies() {
  const ids = useEnemyListStore((s) => s.ids);
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
  return (
    <>
      {ids.map((id) => (
        <MistWisp key={id} id={id} geometry={shared} />
      ))}
    </>
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

  useFrame((_, rawDt) => {
    const v = enemyRuntime.get(id);
    const g = group.current;
    if (!v || !g) return;
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

    // AI：遊玩中才更新；依距離降頻、太遠暫停（規格 6.6）
    const player = playerRuntime.position;
    const toPlayer = Math.hypot(player.x - ai.x, player.z - ai.z);
    const interval = aiUpdateInterval(toPlayer);
    if (isControllable(currentScreen()) && v.vanishing === null && interval !== null) {
      v.sinceUpdate += dt;
      if (v.sinceUpdate >= interval) {
        const peaceful = useDebugStore.getState().peaceful;
        const alive = !authority.getState().player.defeated && !peaceful;
        const out = stepEnemyAi(ai, def, {
          dt: v.sinceUpdate,
          player: { x: player.x, z: player.z, alive },
          home: { x: spawner.center[0], z: spawner.center[1], radius: spawner.radius },
          random: Math.random,
        });
        v.sinceUpdate = 0;
        // 出手：玩家仍在範圍內且不在無敵時間，交給權威層結算傷害
        if (out.strike && alive && combatRuntime.invulnerable <= 0 && toPlayer <= def.attackRange + STRIKE_SLACK) {
          authority.send({ type: 'EnemyStrike', enemyId: id });
        }
      }
    }

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
