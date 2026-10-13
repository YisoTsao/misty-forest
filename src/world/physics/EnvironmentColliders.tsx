import { useFrame } from '@react-three/fiber';
import { useRapier, type RapierCollider } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import { playerRuntime } from '@/game/player/localRuntime';
import { perfStats } from '@/game/perfStats';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import type { ColliderShapeSpec, StaticColliderSpec, WorldIndex } from '@/game/world/worldIndex';

/** 玩家此距離內的物件才建立碰撞體（規格 7：只啟用玩家附近者） */
export const ACTIVE_RADIUS = 30;
/** 離開 ACTIVE_RADIUS + HYSTERESIS 才移除，避免在邊界來回建立 / 刪除 */
const HYSTERESIS = 5;
/** 重新查詢的間隔（秒）。以跑速 6.2 m/s 計，0.25 秒只移動約 1.5 m，遠小於啟用半徑 */
const REFRESH_INTERVAL = 0.25;

/**
 * 樹木、岩石、寶箱等靜態物件的簡化碰撞體（圓柱 / 方塊）。
 * 物件數量多，因此不建立 React 元件，而是依玩家位置直接向 Rapier world 新增或移除。
 * 攝影機的 shape cast 也會命中這些碰撞體，因此樹木會自動參與攝影機避讓。
 * 狀態改變的物件（採集後的樹樁、修好的木橋）換成另一組形狀；狀態恢復後換回。
 */
export function EnvironmentColliders({ index }: { index: WorldIndex }) {
  const { world, rapier } = useRapier();
  /** placement id → 目前建立的碰撞體與使用的形狀組 */
  const active = useMemo(() => new Map<string, { colliders: RapierCollider[]; alternate: boolean; x: number; z: number }>(), []);
  const state = useMemo(() => ({ sinceRefresh: Infinity, query: [] as StaticColliderSpec[] }), []);

  const remove = (id: string) => {
    const entry = active.get(id);
    if (!entry) return;
    // Physics 可能已先卸載，此時 world 已釋放
    for (const c of entry.colliders) {
      cameraIgnoredColliders.delete(c.handle);
      if (world.getCollider(c.handle)) world.removeCollider(c, false);
    }
    active.delete(id);
  };

  useEffect(
    () => () => {
      for (const id of [...active.keys()]) remove(id);
    },
    // remove 只依賴 world 與 active
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, active],
  );

  useFrame((_, dt) => {
    state.sinceRefresh += dt;
    if (state.sinceRefresh < REFRESH_INTERVAL) return;
    state.sinceRefresh = 0;

    const { x, z } = playerRuntime.position;
    const objects = useGameStateStore.getState().state.objects;
    const nearby = index.colliders.query(x, z, ACTIVE_RADIUS, state.query);
    for (const spec of nearby) {
      const runtime = objects.get(spec.id);
      const alternate = spec.alternate !== undefined && runtime?.[spec.alternate.when] === true;
      const current = active.get(spec.id);
      if (current?.alternate === alternate) continue;
      if (current) remove(spec.id);
      const shapes = alternate ? (spec.alternate?.shapes ?? []) : spec.normal;
      active.set(spec.id, {
        colliders: shapes.map((s) => {
          const collider = world.createCollider(colliderDesc(rapier, s));
          if (s.cameraIgnore) cameraIgnoredColliders.add(collider.handle);
          return collider;
        }),
        alternate,
        x: spec.x,
        z: spec.z,
      });
    }
    // 只移除超出遲滯範圍者
    const keep = (ACTIVE_RADIUS + HYSTERESIS) ** 2;
    for (const [id, entry] of active) {
      if ((entry.x - x) ** 2 + (entry.z - z) ** 2 > keep) remove(id);
    }
    perfStats.activeColliders = active.size;
  });

  return null;
}

type RapierModule = ReturnType<typeof useRapier>['rapier'];

function colliderDesc(rapier: RapierModule, spec: ColliderShapeSpec) {
  const { shape } = spec;
  const halfHeight = shape.kind === 'cylinder' ? shape.height / 2 : shape.halfExtents[1];
  const desc =
    shape.kind === 'cylinder'
      ? rapier.ColliderDesc.cylinder(halfHeight, shape.radius)
      : rapier.ColliderDesc.cuboid(...shape.halfExtents);
  const half = spec.yaw / 2;
  return desc
    .setTranslation(spec.x, spec.y + halfHeight, spec.z)
    .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) })
    .setFriction(0.6);
}
