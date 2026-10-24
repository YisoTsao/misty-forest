import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BossDef, EnemyDef } from '@/game-core/combat/combat';
import { terrainHeight } from '@/game-core/world/terrain';
import { combat } from '@/game/authority';
import { activeBossEnemy, stepBossArenas, useBossStore, visibleBossMist } from '@/game/combat/bossRuntime';
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
  return bosses.map((b) => (
    <group key={b.id}>
      {b.boss.gate && <ArenaGate bossId={b.id} gate={b.boss.gate} />}
      {b.boss.mist && <BossMistZones def={combat.enemies.get(b.id)! as EnemyDef & { boss: BossDef }} />}
    </group>
  ));
}

/** 紫霧淡入、淡出的時間（秒） */
const MIST_FADE_SEC = 0.8;
/** 每塊紫霧上飄動的霧團數 */
const MIST_PUFFS = 5;

/** 中間濃、邊緣透明的圓形貼圖 */
function softDiscTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * 迷霧暴走的紫霧區（第二章 B-01）：第二階段起祭壇地面冒出紫色迷霧，點亮的共鳴石柱驅散附近的紫霧。
 * 哪幾塊看得到由 bossRuntime.visibleBossMist 決定（與扣血判定同一份資料），這裡只負責淡入淡出與飄動。
 */
function BossMistZones({ def }: { def: EnemyDef & { boss: BossDef } }) {
  const mist = def.boss.mist!;
  const res = useMemo(() => {
    const texture = softDiscTexture();
    const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    const puff = new THREE.IcosahedronGeometry(1, 1);
    const spots = mist.spots.map(() => ({
      fill: new THREE.MeshBasicMaterial({ color: '#8a4fd6', map: texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      puff: new THREE.MeshBasicMaterial({ color: '#b48cf0', transparent: true, opacity: 0, depthWrite: false }),
      fade: 0,
    }));
    for (const s of spots) {
      s.fill.polygonOffset = true;
      s.fill.polygonOffsetFactor = -2;
    }
    return { texture, disc, puff, spots };
  }, [mist]);
  useEffect(
    () => () => {
      res.texture.dispose();
      res.disc.dispose();
      res.puff.dispose();
      for (const s of res.spots) {
        s.fill.dispose();
        s.puff.dispose();
      }
    },
    [res],
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }, dt) => {
    const enemyId = activeBossEnemy(def.id);
    const visible = enemyId ? visibleBossMist(def, enemyId) : [];
    const t = clock.elapsedTime;
    mist.spots.forEach(([x, z], i) => {
      const s = res.spots[i]!;
      const target = visible.some(([vx, vz]) => vx === x && vz === z) ? 1 : 0;
      s.fade += Math.sign(target - s.fade) * Math.min(Math.abs(target - s.fade), Math.min(dt, 1 / 20) / MIST_FADE_SEC);
      const g = groups.current[i];
      if (!g) return;
      g.visible = s.fade > 0.001;
      if (!g.visible) return;
      const pulse = 0.85 + 0.15 * Math.sin(t * 2.2 + i);
      s.fill.opacity = 0.75 * s.fade * pulse;
      s.puff.opacity = 0.32 * s.fade;
      // 驅散時往上散開、變小
      g.scale.setScalar(0.6 + 0.4 * s.fade);
      g.children.forEach((child, k) => {
        if (k === 0) return;
        const a = (k / MIST_PUFFS) * Math.PI * 2 + t * 0.35;
        child.position.set(Math.cos(a) * mist.radius * 0.55, 0.35 + 0.18 * Math.sin(t * 1.6 + k) + (1 - s.fade) * 1.2, Math.sin(a) * mist.radius * 0.55);
      });
    });
  });
  return mist.spots.map(([x, z], i) => (
    <group key={i} ref={(g) => void (groups.current[i] = g)} position={[x, terrainHeight(x, z) + 0.06, z]} visible={false} name={`boss-mist:${def.id}:${i}`}>
      <mesh geometry={res.disc} material={res.spots[i]!.fill} scale={mist.radius * 1.15} renderOrder={2} />
      {Array.from({ length: MIST_PUFFS }, (_, k) => (
        <mesh key={k} geometry={res.puff} material={res.spots[i]!.puff} scale={[0.55, 0.32, 0.55]} />
      ))}
    </group>
  ));
}

function ArenaGate({ bossId, gate }: { bossId: string; gate: NonNullable<BossDef['gate']> }) {
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
  const [x, z] = gate.center;
  const y = terrainHeight(x, z);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const target = closed ? 1 : 0;
    rise.current += Math.sign(target - rise.current) * Math.min(Math.abs(target - rise.current), Math.min(dt, 1 / 20) / RISE_SEC);
    g.visible = rise.current > 0.001;
    g.position.y = y - 0.3 - SUNK * (1 - rise.current) + Math.sin(rise.current * Math.PI) * 0.05;
  });
  const sx = gate.width / WALL_WIDTH;
  return (
    <>
      <group ref={group} position={[x, y - SUNK, z]} rotation={[0, gate.yaw, 0]} scale={[sx, 1.3, 1.3]} visible={false} name={`boss-gate:${bossId}`}>
        {parts.map((p) => (
          <mesh key={p.key} geometry={p.geometry} material={p.material} castShadow receiveShadow />
        ))}
      </group>
      {closed && (
        <RigidBody type="fixed" colliders={false} position={[x, y, z]} rotation={[0, gate.yaw, 0]}>
          <CuboidCollider args={[gate.width / 2, WALL_HEIGHT, 0.8]} position={[0, WALL_HEIGHT / 2, 0]} />
        </RigidBody>
      )}
    </>
  );
}
