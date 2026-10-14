import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BossDef } from '@/game-core/combat/combat';
import { terrainHeight } from '@/game-core/world/terrain';
import { combat } from '@/game/authority';
import { stepBossArenas, useBossStore } from '@/game/combat/bossRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { buildProceduralModel } from '@/render/proceduralModels';

/** 樹根牆模型的寬度（forestModels 的 rootWall，沿 X） */
const WALL_WIDTH = 8.2;
const WALL_HEIGHT = 3.4;
const RISE_SEC = 0.8;
/** 沉下去時埋在地面下的深度 */
const SUNK = 3.6;

/**
 * 頭目戰場（任務 8D，Bible §27.4 入場事件與退出保護）：玩家走進戰場就開戰、離開就結束（bossRuntime），
 * 開戰時入口的樹根從地面升起封住，結束（擊敗、倒下、離開）後沉回地裡。
 */
export function BossArenas() {
  const bosses = useMemo(() => [...combat.enemies.values()].flatMap((e) => (e.boss ? [{ id: e.id, boss: e.boss }] : [])), []);
  useFrame((_, dt) => {
    if (currentScreen() !== 'paused') stepBossArenas(Math.min(dt, 1 / 20));
  });
  return bosses.map((b) => <ArenaGate key={b.id} bossId={b.id} boss={b.boss} />);
}

function ArenaGate({ bossId, boss }: { bossId: string; boss: BossDef }) {
  const closed = useBossStore((s) => s.hud?.bossId === bossId);
  const parts = useMemo(() => buildProceduralModel('procedural:root_wall'), []);
  useEffect(
    () => () =>
      parts.forEach((p) => {
        p.geometry.dispose();
        p.material.dispose();
      }),
    [parts],
  );
  const group = useRef<THREE.Group>(null);
  const rise = useRef(0);
  const [x, z] = boss.gate.center;
  const y = terrainHeight(x, z);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const target = closed ? 1 : 0;
    rise.current += Math.sign(target - rise.current) * Math.min(Math.abs(target - rise.current), Math.min(dt, 1 / 20) / RISE_SEC);
    g.visible = rise.current > 0.001;
    g.position.y = y - 0.3 - SUNK * (1 - rise.current) + Math.sin(rise.current * Math.PI) * 0.05;
  });
  const sx = boss.gate.width / WALL_WIDTH;
  return (
    <>
      <group ref={group} position={[x, y - SUNK, z]} rotation={[0, boss.gate.yaw, 0]} scale={[sx, 1.3, 1.3]} visible={false} name={`boss-gate:${bossId}`}>
        {parts.map((p) => (
          <mesh key={p.key} geometry={p.geometry} material={p.material} castShadow receiveShadow />
        ))}
      </group>
      {closed && (
        <RigidBody type="fixed" colliders={false} position={[x, y, z]} rotation={[0, boss.gate.yaw, 0]}>
          <CuboidCollider args={[boss.gate.width / 2, WALL_HEIGHT, 0.8]} position={[0, WALL_HEIGHT / 2, 0]} />
        </RigidBody>
      )}
    </>
  );
}
