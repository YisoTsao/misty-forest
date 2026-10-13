import { useFrame } from '@react-three/fiber';
import { useRapier, type RapierCollider } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import { playerRuntime } from '@/game/player/localRuntime';
import { perfStats } from '@/game/perfStats';
import type { StaticColliderSpec, WorldIndex } from '@/game/world/worldIndex';

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
 */
export function EnvironmentColliders({ index }: { index: WorldIndex }) {
  const { world, rapier } = useRapier();
  const active = useMemo(() => new Map<string, RapierCollider>(), []);
  const state = useMemo(() => ({ sinceRefresh: Infinity, query: [] as StaticColliderSpec[] }), []);

  useEffect(
    () => () => {
      // 卸載時移除所有碰撞體（Physics 可能已先卸載，此時 world 已釋放）
      for (const collider of active.values()) {
        if (world.getCollider(collider.handle)) world.removeCollider(collider, false);
      }
      active.clear();
    },
    [world, active],
  );

  useFrame((_, dt) => {
    state.sinceRefresh += dt;
    if (state.sinceRefresh < REFRESH_INTERVAL) return;
    state.sinceRefresh = 0;

    const { x, z } = playerRuntime.position;
    const nearby = index.colliders.query(x, z, ACTIVE_RADIUS, state.query);
    for (const spec of nearby) {
      if (active.has(spec.id)) continue;
      active.set(spec.id, world.createCollider(colliderDesc(rapier, spec)));
    }
    // 只移除超出遲滯範圍者
    const keep = (ACTIVE_RADIUS + HYSTERESIS) ** 2;
    for (const [id, collider] of active) {
      const t = collider.translation();
      if ((t.x - x) ** 2 + (t.z - z) ** 2 > keep) {
        world.removeCollider(collider, false);
        active.delete(id);
      }
    }
    perfStats.activeColliders = active.size;
  });

  return null;
}

type RapierModule = ReturnType<typeof useRapier>['rapier'];

function colliderDesc(rapier: RapierModule, spec: StaticColliderSpec) {
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
