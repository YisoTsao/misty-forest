import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mirrorYaw, traceLight, type LightPathDef } from '@/game-core/world/lightPath';
import { lightPaths, worldIndex } from '@/game/authority';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { lightPathRuntime } from '@/game/world/lightPathRuntime';
import { buildProceduralModel } from '@/render/proceduralModels';

/** 鏡面在石柱頂端的高度（底座 0.4 + 石柱 2.9，見 lakeModels 的 mirrorPillarBase）與鏡心再高 0.45 */
const HEAD_Y = 3.3;
const MIRROR_CENTER_Y = HEAD_Y + 0.45;
/** 光照到閘門的高度（石樑） */
const TARGET_Y = 3.4;
/** 鏡面轉動的速度（弧度 / 秒） */
const TURN_RATE = 3;
/** 光束的粗細（公尺） */
const BEAM_RADIUS = 0.07;

/**
 * 水鏡光路（任務 9D，Bible §7.4 quest_lake_002）：轉動的鏡面與光束。
 * 鏡面朝向依權威狀態（轉動次數 × 90°）平滑轉過去；光路依權威狀態追光後畫成發光的細光柱（任務開始後才有光）。
 */
export function MirrorPuzzle() {
  // 每一條光路各自畫（湖底閘門、祕窟石門；第二章 Phase 4）
  return (
    <>
      {lightPaths.map((def) => (
        <MirrorPuzzleScene key={def.id} def={def} />
      ))}
    </>
  );
}

function MirrorPuzzleScene({ def }: { def: LightPathDef }) {
  const objects = useGameStateStore((s) => s.state.objects);
  const quests = useGameStateStore((s) => s.state.quests);
  const mirrors = useMemo(() => def.mirrors.flatMap((id) => worldIndex.placement(id) ?? []), [def]);
  const head = useMemo(() => buildProceduralModel('procedural:mirror_head'), []);
  // 曙光石亮起時的水晶（只取發光的部件，疊在石柱的水晶上）
  const crystal = useMemo(() => buildProceduralModel('procedural:light_pillar_lit').filter((p) => p.name === 'glow'), []);
  useEffect(
    () => () => {
      for (const p of [...head, ...crystal]) {
        p.geometry.dispose();
        p.material.dispose();
      }
    },
    [head, crystal],
  );
  const heads = useRef<(THREE.Group | null)[]>([]);
  useEffect(() => {
    // 第一次出現時直接擺到目前的方向
    mirrors.forEach((p, i) => {
      const g = heads.current[i];
      if (g) g.rotation.y = mirrorYaw(p, useGameStateStore.getState().state.objects.get(p.id)?.turn ?? 0);
    });
  }, [mirrors]);
  useFrame((_, dt) => {
    const state = useGameStateStore.getState().state;
    mirrors.forEach((p, i) => {
      const g = heads.current[i];
      if (!g) return;
      const want = mirrorYaw(p, state.objects.get(p.id)?.turn ?? 0);
      const diff = Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y));
      g.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * Math.min(dt, 0.1));
    });
  });

  // 光：曙光石在任務開始後亮起（任務完成後一直亮著）
  const target = worldIndex.placement(def.target);
  const quest = target ? worldIndex.prefab(target.prefabId)?.activate?.quest : undefined;
  const shining = !quest || quests[quest] !== undefined || objects.get(def.target)?.active === true;
  const beams = useMemo(() => {
    if (!shining) return [];
    const trace = traceLight(def, (id) => worldIndex.placement(id), objects);
    const heightOf = (hit: string | null, fallback: number) => {
      if (!hit) return fallback;
      const p = worldIndex.placement(hit);
      if (!p) return fallback;
      return p.position[1] + (hit === def.target ? TARGET_Y : MIRROR_CENTER_Y);
    };
    let fromY = def.sourceY;
    return trace.segments.map((seg, i) => {
      const toY = heightOf(seg.hit, fromY);
      const beam = { key: i, from: new THREE.Vector3(seg.from.x, fromY, seg.from.z), to: new THREE.Vector3(seg.to.x, toY, seg.to.z), reached: seg.hit === def.target };
      fromY = toY;
      return beam;
    });
  }, [def, objects, shining]);
  useEffect(() => {
    lightPathRuntime[def.id] = beams.length;
    return () => {
      lightPathRuntime[def.id] = 0;
    };
  }, [beams, def.id]);
  const beamMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2c0').multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }), []);
  const beamGeometry = useMemo(() => new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, 1, 6, 1, true), []);
  useEffect(
    () => () => {
      beamMaterial.dispose();
      beamGeometry.dispose();
    },
    [beamMaterial, beamGeometry],
  );

  return (
    <group name="mirror-puzzle">
      {mirrors.map((p, i) => (
        <group key={p.id} ref={(o) => void (heads.current[i] = o)} position={[p.position[0], p.position[1] + HEAD_Y, p.position[2]]}>
          {head.map((part) => (
            <mesh key={part.key} geometry={part.geometry} material={part.material} castShadow={part.name !== 'glow'} />
          ))}
        </group>
      ))}
      {shining && (
        <group position={[def.source[0], def.sourceY - 4.05, def.source[1]]} scale={1.04}>
          {crystal.map((part) => (
            <mesh key={part.key} name="light-source" geometry={part.geometry} material={part.material} />
          ))}
        </group>
      )}
      {beams.map((b) => {
        const mid = b.from.clone().add(b.to).multiplyScalar(0.5);
        const dir = b.to.clone().sub(b.from);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        return <mesh key={b.key} name="light-beam" geometry={beamGeometry} material={beamMaterial} position={mid} quaternion={quat} scale={[1, dir.length(), 1]} />;
      })}
    </group>
  );
}
