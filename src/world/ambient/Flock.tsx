import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createFlock, flockPaused, stepFlock, type FlockDef, type Sheep } from '@/game-core/ambient/sheep';
import { mulberry32 } from '@/game-core/util/random';
import { terrainHeight } from '@/game-core/world/terrain';
import { flocks } from '@/game/authority';
import { ambientRuntime } from '@/game/ambient/ambientRuntime';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import { patchMist } from '@/render/mist';
import { sheepParts } from '@/render/proceduralModels';
import { patchOcclusion } from '@/render/occlusion';
import { toonGradient } from '@/render/toon';

/** 羊群（規格 4.3）：資料驅動的牧草地，本機 AI，玩家遠離時暫停 */
export function Flocks() {
  return (
    <>
      {flocks.map((def) => (
        <Flock key={def.id} def={def} />
      ))}
    </>
  );
}

const tmpMatrix = new THREE.Matrix4();
const tmpPart = new THREE.Matrix4();
const tmpRot = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

function Flock({ def }: { def: FlockDef }) {
  const sheep = useMemo<Sheep[]>(() => createFlock(def), [def]);
  const rand = useMemo(() => mulberry32(def.seed + 1), [def]);
  const parts = useMemo(() => {
    const material = patchOcclusion(patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true })));
    return { list: sheepParts(), material };
  }, []);
  useEffect(
    () => () => {
      parts.list.forEach((p) => p.geometry.dispose());
      parts.material.dispose();
    },
    [parts],
  );
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const colliders = useRef<(RapierCollider | null)[]>([]);
  // 碰撞體擋住角色但不拉近攝影機；handle 在物理初始化後才有，於更新時登記
  const ignored = useRef(new Set<number>());
  useEffect(() => {
    const set = ignored.current;
    return () => set.forEach((h) => cameraIgnoredColliders.delete(h));
  }, []);
  const walkPhase = useRef(sheep.map((s) => s.phase * Math.PI * 2));
  useEffect(() => {
    ambientRuntime.flocks.set(def.id, sheep);
    return () => void ambientRuntime.flocks.delete(def.id);
  }, [def, sheep]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const player = playerRuntime.position;
    const paused = flockPaused(def, player.x, player.z);
    ambientRuntime.flockPaused.set(def.id, paused);
    if (paused) return;
    if (currentScreen() === 'playing') stepFlock(sheep, def, player, dt, rand);
    for (const c of colliders.current) {
      if (c && !ignored.current.has(c.handle)) {
        ignored.current.add(c.handle);
        cameraIgnoredColliders.add(c.handle);
      }
    }
    const t = clock.elapsedTime;
    sheep.forEach((s, i) => {
      const moving = s.mode === 'walk' || s.mode === 'flee';
      const y = terrainHeight(s.x, s.z);
      const phases = walkPhase.current;
      if (moving) phases[i] = phases[i]! + dt * (s.mode === 'flee' ? 16 : 9);
      const swing = moving ? Math.sin(phases[i]!) * 0.5 : 0;
      const bob = moving ? Math.abs(Math.sin(phases[i]!)) * 0.05 : Math.sin(t * 1.5 + s.phase * 6) * 0.01;
      // 吃草時低頭、休息時蹲低
      const headPitch = s.mode === 'graze' ? 0.75 + Math.sin(t * 3 + s.phase * 9) * 0.12 : s.mode === 'rest' ? 0.15 : 0;
      const crouch = s.mode === 'rest' ? -0.18 : 0;
      tmpQuat.setFromAxisAngle(UP, s.yaw);
      tmpPos.set(s.x, y + bob + crouch, s.z);
      const root = tmpMatrix.compose(tmpPos, tmpQuat, ONE);
      parts.list.forEach((part, k) => {
        const mesh = meshes.current[k];
        if (!mesh) return;
        const at = part.at ?? [0, 0, 0];
        const angle = part.name === 'head' ? headPitch : part.name === 'legsA' ? swing : part.name === 'legsB' ? -swing : 0;
        tmpPart.copy(root).multiply(tmpRot.makeTranslation(at[0], at[1] - (part.name.startsWith('legs') ? crouch : 0), at[2]));
        tmpPart.multiply(tmpRot.makeRotationX(angle));
        mesh.setMatrixAt(i, tmpPart);
      });
      bodies.current[i]?.setNextKinematicTranslation({ x: s.x, y: y + 0.6, z: s.z });
    });
    for (const mesh of meshes.current) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {parts.list.map((part, k) => (
        <instancedMesh
          key={part.name}
          ref={(m) => void (meshes.current[k] = m)}
          args={[part.geometry, parts.material, sheep.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
      {sheep.map((s, i) => (
        <RigidBody
          key={i}
          ref={(b) => void (bodies.current[i] = b)}
          type="kinematicPosition"
          colliders={false}
          position={[s.x, terrainHeight(s.x, s.z) + 0.6, s.z]}
        >
          <BallCollider ref={(c) => void (colliders.current[i] = c)} args={[0.5]} />
        </RigidBody>
      ))}
    </>
  );
}
