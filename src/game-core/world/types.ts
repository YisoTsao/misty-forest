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
    cameraIgnore: z.boolean().optional(),
  }),
  z.object({
    shape: z.literal('box'),
    size: vec3.refine((v) => v.every((n) => n > 0), '尺寸必須為正'),
    offset: vec3.optional(),
    /** 攝影機避讓不理會這個形狀（矮欄杆：擋角色但不該把攝影機拉近） */
    cameraIgnore: z.boolean().optional(),
  }),
]);
export type CollisionShape = z.infer<typeof collisionShapeSchema>;

/** 一個或多個碰撞形狀（例如木橋的橋面加兩側欄杆） */
export const collisionSchema = z.union([collisionShapeSchema, z.array(collisionShapeSchema).min(1)]);
export type Collision = z.infer<typeof collisionSchema>;

export function collisionShapes(c: Collision | undefined): CollisionShape[] {
  if (!c) return [];
  return Array.isArray(c) ? c : [c];
}

export const interactionKinds = ['harvest', 'open', 'talk', 'enter', 'read', 'build', 'repair'] as const;
export type InteractionKind = (typeof interactionKinds)[number];

/** 1. Prefab：這種物件「是什麼」。 */
export const prefabSchema = z
  .object({
    id: z.string().min(1),
    /** GLB / glTF 路徑，或 `procedural:<id>`（程式產生的模型，例如花叢） */
    /** GLB / glTF 路徑，或 `procedural:<id>`（程式產生的模型，例如花叢） */
    model: z.string().min(1),
    collider: z.enum(['none', 'static', 'sensor', 'dynamic']),
    collision: collisionSchema.optional(),
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
        harvestedCollision: collisionSchema.optional(),
        /** 採集時角色播放的動作（砍樹、敲石頭用 attack，摘花用 interact） */
        anim: z.enum(['attack', 'interact']).optional(),
      })
      .optional(),
    /** 寶箱內容（打開時給予，只能領一次） */
    contents: z.object({
      lootTableId: z.string().min(1),
      /** 打開時解鎖星光夥伴（序章：碎片裡飛出了小星星） */
      unlocksCompanion: z.boolean().optional(),
    }).optional(),
    /** 可修復的物件（規格 5.2 木橋：損毀 / 修復兩狀態）：修復後的外觀與碰撞、需要的材料、限定的任務 */
    repair: z
      .object({
        model: z.string().min(1),
        collision: collisionSchema.optional(),
        materials: z.array(z.object({ itemId: z.string().min(1), count: z.number().int().positive() })).min(1),
        /** 只有這個任務進行中才能修（規格：修復任務中可互動） */
        quest: z.string().min(1).optional(),
      })
      .optional(),
    /** 互動點相對物件原點的位移（模型單位，會乘上縮放並旋轉）：例如木橋在橋頭互動 */
    interactOffset: vec3.optional(),
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
  .refine((p) => p.interaction !== 'repair' || p.repair !== undefined, {
    message: 'interaction 為 repair 時必須提供 repair 設定',
    path: ['repair'],
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
  /** 可修復物件已修好 */
  repaired?: boolean;
};

/** 4. SaveState：只記錄與預設不同的差異。 */
export type SaveObjectDelta = { placementId: string } & Partial<
  Pick<ObjectRuntime, 'harvested' | 'respawnAt' | 'hp' | 'open' | 'repaired'>
>;
