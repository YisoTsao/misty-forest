// 規格 3.1：資料四層。靜態定義不得混入執行期狀態與存檔格式。
import { z } from 'zod';

export type Vec3 = [number, number, number];

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const regionIds = [
  'meadow',
  'village',
  'forest',
  'lake',
  'home',
  'overlook',
  'ruins',
  'highland',
  'farmland',
  'river',
  // 螢苔祕林（任務 8A，Bible §6.2）
  'moss_trail',
  'moss_glade',
  'root_maze',
  'moss_crown',
  // 澄鏡湖（任務 9A，Bible §7.2）：湖岸（含淺水石徑）、湖畔營地、倒影蘆葦島、水鏡遺構、水鏡神殿
  'lake_shore',
  'lake_camp',
  'reed_isle',
  'mirror_ruins',
  'mirror_temple',
  // 風語草原（任務 9F，Bible §8.2）：起伏草原（預設）、風車聚落、浮石山脊、風向塔台地、風之巨偶競技場
  'windy_hills',
  'windmill_hamlet',
  'floatstone_ridge',
  'wind_tower',
  'golem_arena',
] as const;
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

export const interactionKinds = ['harvest', 'open', 'talk', 'enter', 'read', 'build', 'repair', 'activate', 'turn'] as const;
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
        /** 只有這個任務進行中才能撿（任務 7D 燈罩碎片：任務唯一的固定拾取物） */
        quest: z.string().min(1).optional(),
      })
      .optional(),
    /** 寶箱內容（打開時給予，只能領一次） */
    contents: z.object({
      lootTableId: z.string().min(1),
      /** 打開時解鎖星光夥伴（序章：碎片裡飛出了小星星） */
      unlocksCompanion: z.boolean().optional(),
      /** 打開時開始這個任務（任務 7O：芽芽說要帶你去晨曦村；任務必須可接取） */
      startsQuest: z.string().min(1).optional(),
    }).optional(),
    /** 可修復的物件（規格 5.2 木橋：損毀 / 修復兩狀態）：修復後的外觀與碰撞、需要的材料、限定的任務 */
    repair: z
      .object({
        model: z.string().min(1),
        collision: collisionSchema.optional(),
        materials: z.array(z.object({ itemId: z.string().min(1), count: z.number().int().positive() })).min(1),
        /** 只有這個任務進行中才能修（規格：修復任務中可互動） */
        quest: z.string().min(1).optional(),
        /** 依序：任務中排在這個物件之前的目標都完成了才能修（任務 7D：先清掉迷霧核心才能點亮燈塔） */
        ordered: z.boolean().optional(),
      })
      .optional(),
    /**
     * 開關式機關（任務 8C：點亮路燈、移開樹根、打開閘門、苔蘚節點被水喚醒）：只能啟動一次。
     * model：啟動後的外觀（省略時整個物件隱藏）；collision：啟動後的碰撞（省略時移除碰撞）；
     * quest：只有這個任務進行中才能啟動；lootTableId：啟動時取得的物品（移開的樹根留下根纖維）；
     * interaction 不是 activate 的物件（苔蘚節點、苔冠空地的樹根）只由規則啟動（水流、任務獎勵）。
     */
    activate: z
      .object({
        model: z.string().min(1).optional(),
        collision: collisionSchema.optional(),
        quest: z.string().min(1).optional(),
        lootTableId: z.string().min(1).optional(),
        /** 只有這個頭目戰鬥中才能啟動（任務 8D 戰場邊的水槽） */
        boss: z.string().min(1).optional(),
        /** 擊敗這個頭目後才能啟動（任務 8D-2 森林根源石） */
        afterBoss: z.string().min(1).optional(),
        /** 依序：任務中排在這個物件之前的目標都完成了才能啟動（任務 7D：先趕走迷霧噗啾才能淨化迷霧核心） */
        ordered: z.boolean().optional(),
        /** 啟動時開始這個任務（任務 7L：調查腳印；任務必須是可接取的狀態） */
        startsQuest: z.string().min(1).optional(),
        /** 啟動時交出的物品（任務 7L：把野果放在巢穴旁） */
        consume: z.array(z.object({ itemId: z.string().min(1), count: z.number().int().positive() })).min(1).optional(),
        /** 另一個物件啟動 seconds 秒（遊戲時間）後才能啟動（任務 7L：離開一陣子再回來觀察） */
        after: z.object({ placement: z.string().min(1), seconds: z.number().positive() }).optional(),
        anim: z.enum(['attack', 'interact']).optional(),
        /** 玩家啟動時顯示的訊息（任務 9C：倒影裡看到的景象） */
        message: z.object({ titleKey: z.string().min(1), bodyKey: z.string().min(1) }).optional(),
      })
      .optional(),
    /** 可轉動的機關（任務 8C 水輪）：每次互動轉到下一個位置，共 positions 個位置 */
    turn: z.object({ positions: z.number().int().min(2), /** 只有這個任務進行中才能轉（任務 9D 水鏡） */ quest: z.string().min(1).optional() }).optional(),
    /** 互動點相對物件原點的位移（模型單位，會乘上縮放並旋轉）：例如木橋在橋頭互動 */
    interactOffset: vec3.optional(),
    /**
     * 出入口（規格 5.2：門與入口、可進入建築）：前往的室內 id、overworld 回到戶外，或地圖 id（任務 8A 地圖切換）。
     * 地圖出入口：抵達時站在 arriveAt（對面的出入口 placement）前方 arriveDistance 公尺、背對它；
     * requires 未達成時不能通過，顯示 lockedKey 的訊息（Bible §3.2：封鎖以自然方式表現並說明原因）。
     */
    enter: z
      .object({
        to: z.string().min(1),
        arriveAt: z.string().min(1).optional(),
        arriveDistance: z.number().positive().optional(),
        /** 通過條件：questCompleted 任務完成；questActive 任務進行中；night 只有夜裡（任務 7M 燈塔地窖） */
        requires: z.object({ questCompleted: z.string().min(1).optional(), questActive: z.string().min(1).optional(), night: z.boolean().optional() }).optional(),
        lockedKey: z.string().min(1).optional(),
      })
      .optional(),
    /** 互動提示的動詞（i18n key），預設依 interaction（例如出口顯示「離開」） */
    verbKey: z.string().min(1).optional(),
    /** 可閱讀的告示牌 / 路標（interaction 為 read）：顯示的標題與內文（i18n key） */
    read: z.object({ titleKey: z.string().min(1), bodyKey: z.string().min(1) }).optional(),
    /** 環境動畫（規格 4.3）：模型中某個節點持續旋轉（風車扇葉）或來回擺動（曬衣繩上的衣服），軸為節點的局部座標 */
    animate: z
      .array(
        z.object({
          node: z.string().min(1),
          kind: z.enum(['spin', 'sway']),
          axis: vec3,
          /** spin：弧度 / 秒；sway：擺動頻率（弧度 / 秒） */
          speed: z.number(),
          /** sway 的擺幅（弧度） */
          amplitude: z.number().optional(),
        }),
      )
      .optional(),
    /** 超過這個距離（公尺，攝影機到區塊）就不畫（小型點綴：草叢、小花、蘑菇、作物；任務 7A 效能） */
    cullDistance: z.number().positive().optional(),
    /** 夜晚窗戶亮燈（任務 7N：KayKit 建築的窗戶色票格發光） */
    nightWindows: z.boolean().optional(),
    /** false：不投射陰影（小型點綴，省下陰影 pass 的 draw call） */
    castShadow: z.boolean().optional(),
    /** 煙囪頂端（模型單位，乘上縮放與旋轉）：冒出炊煙 */
    smoke: vec3.optional(),
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
  .refine((p) => p.interaction !== 'read' || p.read !== undefined, {
    message: 'interaction 為 read 時必須提供 read 設定',
    path: ['read'],
  })
  .refine((p) => p.interaction !== 'enter' || p.enter !== undefined, {
    message: 'interaction 為 enter 時必須提供 enter 設定',
    path: ['enter'],
  })
  .refine((p) => p.interaction !== 'repair' || p.repair !== undefined, {
    message: 'interaction 為 repair 時必須提供 repair 設定',
    path: ['repair'],
  })
  .refine((p) => p.interaction !== 'activate' || p.activate !== undefined, {
    message: 'interaction 為 activate 時必須提供 activate 設定',
    path: ['activate'],
  })
  .refine((p) => p.interaction !== 'turn' || p.turn !== undefined, {
    message: 'interaction 為 turn 時必須提供 turn 設定',
    path: ['turn'],
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
  /** 開關式機關已啟動（任務 8C） */
  active?: boolean;
  /** 可轉動機關目前的位置（任務 8C；省略為 0） */
  turn?: number;
  /** 啟動時的遊戲時間（任務 7L：放下野果之後要等一段時間） */
  activatedAt?: number;
};

/** 4. SaveState：只記錄與預設不同的差異。 */
export type SaveObjectDelta = { placementId: string } & Partial<
  Pick<ObjectRuntime, 'harvested' | 'respawnAt' | 'hp' | 'open' | 'repaired' | 'active' | 'turn'>
>;
