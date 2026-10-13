import type { WorldLookup } from '@/game-core/world/objects';
import { SpatialGrid } from '@/game-core/world/spatialGrid';
import { collisionShapes, type Collision, type CollisionShape, type Placement, type Prefab } from '@/game-core/world/types';
import type { WorldData } from '@/game-core/world/worldData';

/** 一個碰撞形狀：已套用 placement 的縮放與旋轉（世界單位）。 */
export type ColliderShapeSpec = {
  x: number;
  /** 碰撞體底部高度 */
  y: number;
  z: number;
  yaw: number;
  shape: { kind: 'cylinder'; radius: number; height: number } | { kind: 'box'; halfExtents: [number, number, number] };
  cameraIgnore: boolean;
};

/**
 * 一個 placement 的碰撞體：平常的形狀，以及狀態改變後的另一組形狀
 * （採集後的樹樁、修好的木橋；空陣列表示那個狀態沒有碰撞）。
 */
export type StaticColliderSpec = {
  id: string;
  /** placement 原點（格網查詢與距離判斷用） */
  x: number;
  z: number;
  normal: ColliderShapeSpec[];
  alternate?: { when: 'harvested' | 'repaired'; shapes: ColliderShapeSpec[] };
};

export type InteractableSpec = {
  id: string;
  x: number;
  z: number;
  radius: number;
  prefab: Prefab;
};

/** 預設可互動距離（公尺） */
const DEFAULT_INTERACT_RADIUS = 2;
/** 格子大小約為查詢半徑的一半，避免單次查詢掃過太多格 */
const GRID_CELL = 8;
/** 碰撞形狀離 placement 原點的最大水平距離（木橋約 7 m），isOccupied 以此為查詢半徑 */
const MAX_COLLIDER_REACH = 9;

function scaledShape(shape: CollisionShape, scale: readonly number[]): ColliderShapeSpec['shape'] {
  const [sx = 1, sy = 1, sz = 1] = scale;
  if (shape.shape === 'cylinder') {
    // 非等比縮放時取水平較大者，寧可略大也不要讓角色穿進模型
    return { kind: 'cylinder', radius: shape.radius * Math.max(sx, sz), height: shape.height * sy };
  }
  const [w, h, d] = shape.size;
  return { kind: 'box', halfExtents: [(w * sx) / 2, (h * sy) / 2, (d * sz) / 2] };
}

/** 局部位移先縮放再依 yaw 旋轉（與 three 的 Y 軸旋轉一致：x' = x cos + z sin，z' = −x sin + z cos） */
function localToWorld(p: Placement, offset: readonly number[] | undefined): { x: number; y: number; z: number } {
  const [x, y, z] = p.position;
  const scale = p.scale ?? [1, 1, 1];
  const yaw = p.rotation?.[1] ?? 0;
  const [ox = 0, oy = 0, oz = 0] = offset ?? [];
  const lx = ox * scale[0]!;
  const lz = oz * scale[2]!;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { x: x + lx * cos + lz * sin, y: y + oy * scale[1]!, z: z - lx * sin + lz * cos };
}

function shapeSpecs(p: Placement, collision: Collision | undefined): ColliderShapeSpec[] {
  const yaw = p.rotation?.[1] ?? 0;
  return collisionShapes(collision).map((c) => ({
    ...localToWorld(p, c.offset),
    yaw,
    shape: scaledShape(c, p.scale ?? [1, 1, 1]),
    cameraIgnore: c.cameraIgnore === true,
  }));
}

function colliderSpec(p: Placement, prefab: Prefab): StaticColliderSpec | null {
  if (prefab.collider !== 'static' || !prefab.collision) return null;
  const spec: StaticColliderSpec = { id: p.id, x: p.position[0], z: p.position[2], normal: shapeSpecs(p, prefab.collision) };
  if (prefab.harvest) spec.alternate = { when: 'harvested', shapes: shapeSpecs(p, prefab.harvest.harvestedCollision) };
  else if (prefab.repair) spec.alternate = { when: 'repaired', shapes: shapeSpecs(p, prefab.repair.collision) };
  return spec;
}

/**
 * 由世界資料建立的查詢索引（啟動時建立一次，之後唯讀）：
 * - placement / prefab 查表（給 game-core 規則用）
 * - 靜態碰撞體格網（只啟用玩家附近者，規格 7）
 * - 可互動物件格網（互動目標空間查詢，規格 6.2）
 */
export class WorldIndex implements WorldLookup {
  readonly colliders: SpatialGrid<StaticColliderSpec>;
  readonly interactables: SpatialGrid<InteractableSpec>;
  readonly colliderCount: number;
  private readonly placementById: Map<string, Placement>;

  constructor(private readonly data: WorldData) {
    this.placementById = new Map(data.placements.map((p) => [p.id, p]));
    const colliders: StaticColliderSpec[] = [];
    const interactables: InteractableSpec[] = [];
    for (const p of data.placements) {
      const prefab = data.prefabs.get(p.prefabId);
      if (!prefab) continue; // parseWorldData 已保證存在
      const c = colliderSpec(p, prefab);
      if (c) colliders.push(c);
      if (prefab.interaction) {
        const at = localToWorld(p, prefab.interactOffset);
        interactables.push({ id: p.id, x: at.x, z: at.z, radius: prefab.interactRadius ?? DEFAULT_INTERACT_RADIUS, prefab });
      }
    }
    this.colliderCount = colliders.length;
    this.colliders = new SpatialGrid(colliders, GRID_CELL);
    this.interactables = new SpatialGrid(interactables, GRID_CELL);
  }

  /**
   * (x, z) 是否落在任何靜態碰撞體（平常的形狀）的水平範圍內（含 margin）。給草花散佈避開樹幹、岩石與建築。
   * 只在載入時呼叫，因此每次配置查詢陣列沒有問題。
   */
  isOccupied(x: number, z: number, margin = 0.15): boolean {
    for (const spec of this.colliders.query(x, z, MAX_COLLIDER_REACH)) {
      for (const c of spec.normal) {
        const dx = x - c.x;
        const dz = z - c.z;
        if (c.shape.kind === 'cylinder') {
          if (dx * dx + dz * dz < (c.shape.radius + margin) ** 2) return true;
          continue;
        }
        // 轉到方塊的局部座標（反向 yaw）
        const cos = Math.cos(c.yaw);
        const sin = Math.sin(c.yaw);
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        const [hx, , hz] = c.shape.halfExtents;
        if (Math.abs(lx) < hx + margin && Math.abs(lz) < hz + margin) return true;
      }
    }
    return false;
  }

  placement(id: string): Placement | undefined {
    return this.placementById.get(id);
  }

  prefab(id: string): Prefab | undefined {
    return this.data.prefabs.get(id);
  }
}
