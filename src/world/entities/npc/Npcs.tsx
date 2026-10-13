import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { stepPatrol, type NpcDef } from '@/game-core/npc/npc';
import { terrainHeight } from '@/game-core/world/terrain';
import { npcs } from '@/game/authority';
import { npcRuntime } from '@/game/npc/npcRuntime';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { assetUrl } from '@/game/worldData';
import { AssetBoundary } from '../../AssetBoundary';
import { prepareModel } from '../player/CharacterModel';

/** 與玩家相同的膠囊尺寸（同一套骨架模型） */
const CAPSULE = { radius: 0.32, halfHeight: 0.46 };
const FOOT_OFFSET = CAPSULE.radius + CAPSULE.halfHeight;
const FADE = 0.2;
/** 玩家在這個距離內時，巡邏的 NPC 停下來（避免把玩家擠開） */
const YIELD_DISTANCE = 1.4;
const TURN_RATE = 8;

/** 村莊 NPC（規格 5.2、6.4）：資料驅動，每個 NPC 有碰撞、待機 / 巡邏、對話時面向玩家。 */
export function Npcs() {
  return (
    <>
      {npcs.map((npc) => (
        <AssetBoundary key={npc.id} name={`npc:${npc.id}`}>
          <NpcActor def={npc} />
        </AssetBoundary>
      ))}
    </>
  );
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function NpcActor({ def }: { def: NpcDef }) {
  const gltf = useGLTF(assetUrl(def.model));
  const { root, materials } = useMemo(() => prepareModel(gltf.scene, def.hiddenNodes), [gltf.scene, def.hiddenNodes]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const groupRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<RapierRigidBody>(null);
  const { actions } = useAnimations(gltf.animations, groupRef);
  const anim = useMemo(() => ({ current: '', wasTalking: false, talkUntil: 0, time: 0 }), []);
  const runtime = npcRuntime.get(def.id);
  if (!runtime) throw new Error(`NPC ${def.id} 沒有執行期狀態`);

  useEffect(() => {
    const missing = Object.values(def.clips).filter((name) => !actions[name]);
    if (missing.length > 0) throw new Error(`NPC ${def.id} 缺少動畫片段：${missing.join(', ')}`);
    const talk = actions[def.clips.talk];
    if (talk) {
      talk.setLoop(THREE.LoopOnce, 1);
      talk.clampWhenFinished = false;
    }
  }, [actions, def]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    if (currentScreen() === 'paused') return;
    anim.time += dt;
    const player = playerRuntime.position;
    const toPlayer = Math.hypot(player.x - runtime.x, player.z - runtime.z);

    let desiredYaw: number | null = null;
    runtime.walking = false;
    if (runtime.talking) {
      desiredYaw = Math.atan2(player.x - runtime.x, player.z - runtime.z);
    } else if (def.patrol && toPlayer > YIELD_DISTANCE) {
      const step = stepPatrol(def.patrol, runtime.patrol, runtime, dt);
      runtime.x = step.x;
      runtime.z = step.z;
      runtime.walking = step.walking;
      desiredYaw = step.yaw;
    } else if (!def.patrol) {
      // 固定站位的 NPC 慢慢轉回原本的方向
      desiredYaw = def.facingYaw;
    }
    if (desiredYaw !== null) runtime.yaw += angleDelta(runtime.yaw, desiredYaw) * Math.min(1, TURN_RATE * dt);
    runtime.y = terrainHeight(runtime.x, runtime.z);

    bodyRef.current?.setNextKinematicTranslation({ x: runtime.x, y: runtime.y + FOOT_OFFSET, z: runtime.z });
    const visual = visualRef.current;
    if (visual) {
      visual.position.set(runtime.x, runtime.y, runtime.z);
      visual.rotation.y = runtime.yaw;
    }

    // 動畫：開始對話時播一次說話手勢，之後待機；巡邏中走路
    if (runtime.talking && !anim.wasTalking) anim.talkUntil = anim.time + (actions[def.clips.talk]?.getClip().duration ?? 0);
    anim.wasTalking = runtime.talking;
    const clip = runtime.walking ? def.clips.walk : anim.time < anim.talkUntil ? def.clips.talk : def.clips.idle;
    if (clip === anim.current) return;
    const next = actions[clip];
    const prev = anim.current ? actions[anim.current] : undefined;
    if (!next) return;
    next.reset().setEffectiveWeight(1).fadeIn(prev ? FADE : 0).play();
    if (prev && prev !== next) prev.fadeOut(FADE);
    anim.current = clip;
  });

  const y0 = runtime.y;
  return (
    <>
      <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} position={[runtime.x, y0 + FOOT_OFFSET, runtime.z]}>
        <CapsuleCollider args={[CAPSULE.halfHeight, CAPSULE.radius]} />
      </RigidBody>
      <group ref={visualRef} position={[runtime.x, y0, runtime.z]} rotation-y={runtime.yaw}>
        <group ref={groupRef} scale={def.scale}>
          <primitive object={root} />
        </group>
      </group>
    </>
  );
}
