import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type * as THREE from 'three';
import type { CharacterDef } from '@/game-core/character/characterDef';
import { initialLocomotionState, stepLocomotion } from '@/game-core/character/locomotion';
import { isControllable } from '@/game-core/flow/gameFlow';
import { createSafePointTrail, defaultSafePointOptions, nearestSafePoint, recordSafePoint } from '@/game-core/world/safePoints';
import { mapAt } from '@/game-core/world/maps';
import { SPAWN_POINT, terrainHeight, WATER_LEVEL } from '@/game-core/world/terrain';
import { countItem } from '@/game-core/inventory/inventory';
import { authority } from '@/game/authority';
import { combatRuntime } from '@/game/combat/combatRuntime';
import { input } from '@/game/input/inputManager';
import { cameraRuntime, playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { isModalOpen } from '@/game/state/uiStore';
import { AssetBoundary } from '../../AssetBoundary';
import { CharacterModel } from './CharacterModel';

const MAX_DT = 1 / 20;
/** 低於此高度視為掉出地圖 */
const KILL_Y = -25;
/** 腳底沉到水面以下這麼深就算落水（不做游泳，回到最近的安全點） */
const DROWN_DEPTH = 0.6;
/** 帶著水行護符（任務 9D，Bible §7.4：涉水與短距離潛入）時可以走進較深的水裡 */
const CHARM_DEPTH = 2.2;
const WATER_CHARM = 'water_charm';
const deg = Math.PI / 180;
const NO_MOVE = { right: 0, forward: 0, run: false, jumpPressed: false };

type KinematicCharacterController = ReturnType<ReturnType<typeof useRapier>['world']['createCharacterController']>;

function spawnCenter(def: CharacterDef): { x: number; y: number; z: number } {
  const { radius, halfHeight } = def.capsule;
  return { x: SPAWN_POINT.x, y: terrainHeight(SPAWN_POINT.x, SPAWN_POINT.z) + halfHeight + radius + 0.05, z: SPAWN_POINT.z };
}

/**
 * 玩家：Rapier kinematic 角色控制器 + 膠囊碰撞（規格 6.1）。
 * 移動量由 game-core 的 stepLocomotion 決定，碰撞修正交給控制器。
 * 外觀與剛體分開，直接依本幀計算的位置擺放，避免與攝影機產生一幀落差。
 */
export function Player({ def, colliderRef }: { def: CharacterDef; colliderRef: RefObject<RapierCollider | null> }) {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<THREE.Group>(null);
  const spawn = useMemo(() => spawnCenter(def), [def]);
  const footOffset = def.capsule.halfHeight + def.capsule.radius;

  // 在 effect 內建立並於 cleanup 釋放：StrictMode（開發模式）會執行「掛載 → 卸載 → 再掛載」，
  // 若用 useMemo 建立，第二次掛載會拿到已被釋放的控制器，之後每幀都會拋錯。
  const controllerRef = useRef<KinematicCharacterController | null>(null);
  useEffect(() => {
    const c = world.createCharacterController(0.02);
    c.enableAutostep(0.35, 0.15, false);
    c.enableSnapToGround(0.4);
    c.setMaxSlopeClimbAngle(50 * deg);
    c.setMinSlopeSlideAngle(55 * deg);
    c.setApplyImpulsesToDynamicBodies(true);
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  useEffect(() => {
    Object.assign(playerRuntime.position, spawn);
    playerRuntime.safePoints = createSafePointTrail(spawn);
  }, [spawn]);

  useFrame((_, rawDt) => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!body || !collider || !controller) return;
    const dt = Math.min(rawDt, MAX_DT);
    const screen = currentScreen();
    // 暫停：角色與動作計時完全停住
    if (screen === 'paused') return;

    const restore = playerRuntime.restoreRequest;
    if (playerRuntime.newGameRequest || restore) {
      // 新遊戲回到出生點、面向北方；讀檔回到存檔位置。清除安全點與進行中的動作
      const at = restore ? { ...restore.position, y: restore.position.y + 0.05 } : spawn;
      playerRuntime.newGameRequest = false;
      playerRuntime.restoreRequest = null;
      playerRuntime.action = null;
      playerRuntime.locomotion = initialLocomotionState(restore?.facingYaw ?? Math.PI);
      playerRuntime.safePoints = createSafePointTrail(at);
      body.setTranslation(at, true);
      Object.assign(playerRuntime.position, at);
      playerRuntime.warpSeq++;
      return;
    }

    const action = playerRuntime.action;
    // 近戰招式出手時往前衝（GAME_DESIGN 5.3）：命中前沿面向方向位移，碰撞照常由控制器處理
    let lunge = 0;
    if (action) {
      const elapsed = action.elapsed ?? 0;
      if (action.lunge && elapsed < (action.lungeTime ?? 0)) lunge = action.lunge * Math.min(dt, (action.lungeTime ?? 0) - elapsed);
      action.elapsed = elapsed + dt;
      action.remaining -= dt;
      if (action.remaining <= 0) playerRuntime.action = null;
    }
    // 互動動作中、視窗開啟時或主選單中不接受移動輸入（仍持續套用重力與減速）
    const jumpPressed = input.consumePressed('jump');
    const blocked = action !== null || isModalOpen() || !isControllable(screen);
    const move = blocked
      ? NO_MOVE
      : { ...input.moveAxes(), run: input.isDown('run'), jumpPressed };
    const { state, delta } = stepLocomotion(
      playerRuntime.locomotion,
      move,
      cameraRuntime.yaw,
      playerRuntime.locomotion.grounded,
      def.locomotion,
      dt,
    );

    // 被泥團打中：一段時間內走得比較慢（任務 8B，迷霧芽怪）
    const slow = combatRuntime.slow;
    if (slow.remaining > 0) {
      slow.remaining = Math.max(0, slow.remaining - dt);
      delta.x *= slow.scale;
      delta.z *= slow.scale;
    }
    if (lunge > 0) {
      delta.x += Math.sin(state.facingYaw) * lunge;
      delta.z += Math.cos(state.facingYaw) * lunge;
    }
    controller.computeColliderMovement(collider, delta);
    const moved = controller.computedMovement();
    state.grounded = controller.computedGrounded();
    // 撞到天花板時停止上升
    if (delta.y > 0 && moved.y < delta.y * 0.5) state.vy = 0;

    const t = body.translation();
    const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z };

    const teleport = playerRuntime.teleportRequest;
    const feetY = next.y - footOffset;
    // 湖與溪共用水面高度：腳底沉到水面以下就是落水（淺灘水深不到 DROWN_DEPTH，可以涉水；水行護符可以走得更深）
    const depth = countItem(authority.getState().inventory, WATER_CHARM) > 0 ? CHARM_DEPTH : DROWN_DEPTH;
    const inWater = feetY < WATER_LEVEL - depth && terrainHeight(next.x, next.z) < WATER_LEVEL - depth;
    const fellOut = next.y < KILL_Y || inWater;
    if (teleport) {
      const feet = teleport.feetY ?? terrainHeight(teleport.x, teleport.z);
      Object.assign(next, { x: teleport.x, y: feet + footOffset + 0.05, z: teleport.z });
    } else if (fellOut) {
      // 掉出地圖或落水：回到離掉落處最近、曾經站穩過的安全點（規格 6.1）
      // 沒有安全點時回到所在地圖的重生點（新遊戲為出生點）
      const map = mapAt(next.x, next.z);
      const fallback = map.id === 'dawnvale' ? spawn : { x: map.respawn.x, y: terrainHeight(map.respawn.x, map.respawn.z) + footOffset + 0.05, z: map.respawn.z };
      const to = nearestSafePoint(playerRuntime.safePoints, next, fallback);
      Object.assign(next, { x: to.x, y: to.y + 0.05, z: to.z });
      playerRuntime.respawnCount++;
    }
    if (teleport || fellOut) {
      state.vx = state.vy = state.vz = 0;
      body.setTranslation(next, true);
      playerRuntime.teleportRequest = null;
      playerRuntime.safePoints.groundedFor = 0;
      playerRuntime.warpSeq++;
    } else {
      body.setNextKinematicTranslation(next);
      // 水邊（腳底接近湖面）不記錄安全點，避免重生在水裡
      recordSafePoint(playerRuntime.safePoints, next, state.grounded && feetY > WATER_LEVEL + 0.2, dt, defaultSafePointOptions);
    }

    playerRuntime.locomotion = state;
    Object.assign(playerRuntime.position, next);
    playerRuntime.positionAt = performance.now();

    const visual = visualRef.current;
    if (visual) {
      visual.position.set(next.x, next.y - footOffset, next.z);
      visual.rotation.y = state.facingYaw;
    }
  });

  return (
    <>
      <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} position={[spawn.x, spawn.y, spawn.z]} enabledRotations={[false, false, false]}>
        <CapsuleCollider ref={colliderRef} args={[def.capsule.halfHeight, def.capsule.radius]} />
      </RigidBody>
      <group ref={visualRef} position={[spawn.x, spawn.y - footOffset, spawn.z]} rotation-y={playerRuntime.locomotion.facingYaw}>
        {/* 不另設 Suspense：角色載入完成前場景不標記就緒 */}
        <AssetBoundary name={`character:${def.id}`}>
          <CharacterModel def={def} />
        </AssetBoundary>
      </group>
    </>
  );
}
