// 規格 3.1：資料四層。靜態定義不得混入執行期狀態與存檔格式。
import { z } from 'zod';

export type Vec3 = [number, number, number];

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const regionIds = ['meadow', 'village', 'forest', 'lake', 'home', 'overlook', 'ruins'] as const;
export type RegionId = (typeof regionIds)[number];

/**
 * 簡化碰撞體（規格 7：大量物件用圓柱 / 方塊，不用模型網格）。
 * 尺寸為模型本身的單位，實際大小再乘上 placement 的 scale；底部對齊物件原點。
 * offset：模型幾何不在原點時（例如柵欄位於六角地塊邊緣）的局部位移，同樣為模型單位。
 */
export const collisionShapeSchema = z.discriminatedUnion('shape', [
  z.object({
    shape: z.literal('cylinder'),
    radius: z.number().positive(),
    height: z.number().positive(),
    offset: vec3.optional(),
  }),
  z.object({
    shape: z.literal('box'),
    size: vec3.refine((v) => v.every((n) => n > 0), '尺寸必須為正'),
    offset: vec3.optional(),
  }),
]);
export type CollisionShape = z.infer<typeof collisionShapeSchema>;

export const interactionKinds = ['harvest', 'open', 'talk', 'enter', 'read', 'build'] as const;
export type InteractionKind = (typeof interactionKinds)[number];

/** 1. Prefab：這種物件「是什麼」。 */
export const prefabSchema = z
  .object({
    id: z.string().min(1),
    /** GLB / glTF 路徑，或 `procedural:<id>`（程式產生的模型，例如花叢） */
    /** GLB / glTF 路徑，或 `procedural:<id>`（程式產生的模型，例如花叢） */
    model: z.string().min(1),
    collider: z.enum(['none', 'static', 'sensor', 'dynamic']),
    collision: collisionShapeSchema.optional(),
    /** 需要個別元件呈現（例如會開蓋的寶箱）；省略時以 InstancedMesh 批次渲染 */
    entity: z.enum(['chest']).optional(),
    interaction: z.enum(interactionKinds).optional(),
    /** 互動提示顯示的名稱（i18n key） */
    nameKey: z.string().min(1).optional(),
    /** 可互動距離（公尺，從物件原點的水平距離） */
    interactRadius: z.number().positive().optional(),
    harvest: z
      .object({
        lootTableId: z.string().min(1),
        /** 重生時間（遊戲時間秒）；省略表示不重生 */
        respawnSec: z.number().positive().optional(),
        /** 採集後留下的模型（例如樹樁）；省略時整個物件隱藏 */
        harvestedModel: z.string().min(1).optional(),
        /** 採集後的碰撞形狀；省略時移除碰撞 */
        harvestedCollision: collisionShapeSchema.optional(),
        /** 採集時角色播放的動作（砍樹、敲石頭用 attack，摘花用 interact） */
        anim: z.enum(['attack', 'interact']).optional(),
      })
      .optional(),
    /** 寶箱內容（打開時給予，只能領一次） */
    contents: z.object({ lootTableId: z.string().min(1) }).optional(),
    persists: z.boolean(),
  })
  .refine((p) => p.collider !== 'static' || p.collision !== undefined, {
    message: 'collider 為 static 時必須提供 collision 形狀',
    path: ['collision'],
  })
  .refine((p) => p.interaction !== 'harvest' || p.harvest !== undefined, {
    message: 'interaction 為 harvest 時必須提供 harvest 設定',
    path: ['harvest'],
  })
  .refine((p) => p.interaction === undefined || p.nameKey !== undefined, {
    message: '可互動的 prefab 必須提供 nameKey',
    path: ['nameKey'],
  });
export type Prefab = z.infer<typeof prefabSchema>;

/** 2. Placement：它「放在世界哪裡」。 */
export const placementSchema = z.object({
  id: z.string().min(1),
  prefabId: z.string().min(1),
  regionId: z.enum(regionIds),
  chunkId: z.string().optional(),
  position: vec3,
  rotation: vec3.optional(),
  scale: vec3.optional(),
});
export type Placement = z.infer<typeof placementSchema>;

/** 3. RuntimeState：執行期變動（記憶體）。 */
export type ObjectRuntime = {
  placementId: string;
  harvested?: boolean;
  respawnAt?: number;
  hp?: number;
  open?: boolean;
};

/** 4. SaveState：只記錄與預設不同的差異。 */
export type SaveObjectDelta = { placementId: string } & Partial<
  Pick<ObjectRuntime, 'harvested' | 'respawnAt' | 'hp' | 'open'>
>;
