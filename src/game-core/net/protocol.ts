// 多人連線協定（任務 11A，docs/multiplayer/protocol.md）：前端（src/net）與遊戲伺服器（server/）共用的
// 房間名、訊息名、訊息格式與頻率常數。只放純資料與 zod 格式，不 import Colyseus，前端不會帶入伺服器程式。
import { z } from 'zod';

/** 協定版本：伺服器拒絕版本不同的客戶端，避免新舊版本互相送錯格式 */
export const PROTOCOL_VERSION = 3;

/** 唯一的房間類型：整個世界一個房間，玩家各自帶地圖與室內（決策 T-169） */
export const ROOM_NAME = 'world';

/** 頻率與上限（架構文件 §5 的起始值） */
export const NET = {
  /** 伺服器送出狀態更新的間隔（毫秒，20 次 / 秒） */
  patchMs: 50,
  /** 客戶端送出位置的間隔（毫秒，20 次 / 秒） */
  sendMs: 50,
  /** 沒有變化時仍每隔這麼久送一次（毫秒），讓伺服器知道還在 */
  idleResendMs: 1000,
  /** 客戶端每秒最多處理的訊息數；超過的直接丟棄 */
  softMessagesPerSecond: 30,
  /** 超過就斷線（Colyseus 的 maxMessagesPerSecond） */
  hardMessagesPerSecond: 60,
  maxClients: 16,
  nameMaxLength: 16,
  /** 遠端玩家的呈現延遲（毫秒）：在兩個快照之間插值；網路抖動大時自動加長，最多到 interpDelayMaxMs（任務 11C） */
  interpDelayMs: 100,
  interpDelayMaxMs: 300,
  /** 兩次瞬移（warp）最短間隔（毫秒） */
  warpMinIntervalMs: 1500,
  /** 兩次位置修正最短間隔（毫秒） */
  correctionMinIntervalMs: 250,
  /** 斷線（非自願）後伺服器保留座位的秒數：這段時間內重連回來仍是同一個人（任務 11C） */
  reconnectSeconds: 20,
  /** 客戶端自動重連（同一個座位）的次數與最長間隔：總時間約 15 秒，短於伺服器保留的 20 秒 */
  reconnectRetries: 8,
  reconnectMaxDelayMs: 3000,
  /** 加入後至少這麼久才自動重連（SDK 預設 5 秒：剛加入就斷線時直接放棄、改成重新加入，會拿到新的 session） */
  reconnectMinUptimeMs: 1000,
  /** 座位沒了（伺服器重啟、休眠喚醒、保留逾時）時，自動重新加入的間隔（毫秒，依序使用、最後一個重複） */
  rejoinDelaysMs: [1000, 2000, 4000, 8000, 10000],
  /** 自動重新加入最久嘗試多久（毫秒）：涵蓋 Render 免費方案從休眠喚醒的時間 */
  rejoinGiveUpMs: 180_000,
  /** 每個連線每秒最多接受幾則動作（攻擊、施法；任務 11E）：超過的直接丟棄 */
  actionsPerSecond: 8,
  /** 接收端：比呈現時間晚這麼久還沒播放的動作就丟掉（毫秒；例如分頁在背景時累積的） */
  actionStaleMs: 2000,
  /** 聊天（任務 11F）：一則最多幾個字（code point） */
  chatMaxLength: 120,
  /** 每秒最多幾則 */
  chatPerSecond: 2,
  /** 每 chatBurstWindowMs 內最多幾則 */
  chatBurst: 8,
  chatBurstWindowMs: 10_000,
  /** 全服頻道兩則之間的最短間隔（毫秒） */
  globalCooldownMs: 5000,
  /** 同樣的內容在這段時間內再送一次就丟掉（毫秒） */
  chatDuplicateMs: 5000,
  /** 附近頻道聽得到的水平距離（公尺，同一張地圖、同一個室內） */
  chatSayRadius: 30,
  /** 伺服器保留的全服頻道紀錄（新加入的人可以看到最近幾則） */
  chatHistory: 20,
} as const;

/** 客戶端 → 伺服器 */
export const ClientMessage = {
  /** 每 50 ms 一次：目前位置、朝向、動畫 */
  move: 'move',
  /** 合法的瞬移（地圖出入口、進出室內、落水重生、讀檔）：只檢查頻率與落點範圍 */
  warp: 'warp',
  /** 一次性動作（近戰招式、施法；任務 11E）：只是表現，傷害仍由各自的客戶端結算 */
  action: 'action',
  /** 換手上的武器（任務 11E） */
  equip: 'equip',
  /** 聊天（任務 11F） */
  chat: 'chat',
  /** 剛加入時要全服頻道最近的紀錄（每個連線一次） */
  chatHistory: 'chatHistory',
  /** 對時（共享日光）：加入與重新連線時送一次，伺服器回 ServerMessage.time */
  time: 'time',
} as const;

/** 伺服器 → 客戶端 */
export const ServerMessage = {
  /** 移動沒通過驗證：把本機玩家拉回伺服器上的最後合法位置 */
  correction: 'correction',
  /** 其他玩家的一次性動作（ActionMessage 加上 sessionId） */
  action: 'action',
  /** 聊天訊息與系統訊息（ChatOut） */
  chat: 'chat',
  /** 全服頻道最近的紀錄（ChatOut[]） */
  chatHistory: 'chatHistory',
  /** 對時的回覆（TimeReply）：所有人的日夜都以伺服器時間換算 */
  time: 'time',
} as const;

/** 同步的動畫狀態（game-core/character/characterDef.ts 的移動片段） */
export const netAnims = ['idle', 'walk', 'run', 'jump', 'fall', 'land'] as const;
export type NetAnim = (typeof netAnims)[number];

/** 世界座標的合理範圍：所有地圖與室內都在這之內 */
const coord = z.number().min(-100_000).max(100_000);
const height = z.number().min(-200).max(2_000);

export const moveMessageSchema = z.strictObject({
  /** 送出時客戶端自己的時間（毫秒，performance.now）：接收端依送出端的時間軸插值，不受網路與伺服器更新間隔的抖動影響 */
  t: z.number().min(0).max(1e10),
  x: coord,
  y: height,
  z: coord,
  yaw: z.number().min(-1_000).max(1_000),
  anim: z.enum(netAnims),
});
export type MoveMessage = z.infer<typeof moveMessageSchema>;

/** 瞬移與移動同格式 */
export const warpMessageSchema = moveMessageSchema;
export type WarpMessage = MoveMessage;

const dataId = z.string().min(1).max(64);

/**
 * 一次性動作（任務 11E）。t 與 move 的 t 同一個時間軸（送出端的 performance.now），接收端在呈現到那一刻時才播放，
 * 動作與位置對得上。招式與法術 id 由伺服器依資料檢查；細節（動畫片段、速度、時間）由接收端查資料，不在網路上傳。
 */
export const actionMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('melee'), t: z.number().min(0).max(1e10), move: dataId }),
  z.strictObject({
    kind: z.literal('spell'),
    t: z.number().min(0).max(1e10),
    spell: dataId,
    /** cast：開始蓄力（魔法陣）；release：發動（衝擊波、飛彈、流星） */
    phase: z.enum(['cast', 'release']),
    yaw: z.number().min(-1_000).max(1_000),
    /** 流星雨的落點中心 */
    tx: coord.optional(),
    tz: coord.optional(),
  }),
]);
export type ActionMessage = z.infer<typeof actionMessageSchema>;
/** 伺服器轉送給其他人的動作 */
export type RemoteActionMessage = ActionMessage & { sessionId: string };

/** 換武器（任務 11E）；heroClass：職業（換了才帶，使用者 2026-10-17） */
export const equipMessageSchema = z.strictObject({ weapon: dataId, heroClass: dataId.optional() });
export type EquipMessage = z.infer<typeof equipMessageSchema>;

export const chatChannels = ['say', 'global', 'whisper'] as const;
export type ChatChannel = (typeof chatChannels)[number];

/** 客戶端送出的聊天（任務 11F）。text 在伺服器清理後才限制成 chatMaxLength；這裡只擋明顯過長的內容 */
export const chatMessageSchema = z.strictObject({
  channel: z.enum(chatChannels),
  text: z.string().min(1).max(NET.chatMaxLength * 4),
  /** 密語對象的名字 */
  to: z.string().min(1).max(64).optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * 伺服器送出的聊天：玩家說的話（from 由伺服器填，不信任客戶端），或系統訊息（key 為 i18n 字串、vars 為參數）。
 * 密語：收到的人看到 from；送出的人收到一則 to 為對方名字的回顯。
 */
export type ChatOut = {
  id: number;
  /** 伺服器時間（毫秒） */
  t: number;
  channel: ChatChannel | 'system';
  from?: { sessionId: string; name: string };
  to?: string;
  text?: string;
  key?: string;
  vars?: Record<string, string>;
};

export const joinOptionsSchema = z.object({
  protocol: z.number().int(),
  name: z.string().max(64).optional(),
  /** 加入時所在的位置；在可玩範圍內才採用，否則由伺服器指派出生點 */
  at: moveMessageSchema.optional(),
  /** 手上的武器（任務 11E）；不認得就用預設 */
  weapon: dataId.optional(),
  /** 職業（決定外型）；不認得就是旅人 */
  heroClass: dataId.optional(),
});
export type JoinOptions = z.infer<typeof joinOptionsSchema>;

/** 對時：客戶端送出時自己的 Unix 時間（毫秒），伺服器原樣帶回並附上自己的時間 */
export const timeRequestSchema = z.strictObject({ t: z.number().min(0).max(1e14) });
export type TimeRequest = z.infer<typeof timeRequestSchema>;
export type TimeReply = { t: number; now: number };

/** 對時的結果：伺服器時間 − 本機時間（毫秒）。假設來回時間各半，用收到回覆時的本機時間換算 */
export function serverTimeOffset(reply: TimeReply, receivedAt: number): number {
  return reply.now - (reply.t + Math.max(0, receivedAt - reply.t) / 2);
}

export type CorrectionReason = 'speed' | 'vertical' | 'bounds' | 'warp';
export type CorrectionMessage = { x: number; y: number; z: number; reason: CorrectionReason };

/** 客戶端看到的遠端玩家（伺服器狀態的一份唯讀複本） */
export type RemotePlayerView = {
  sessionId: string;
  /** 對方送出這個位置時的時間（對方的時鐘） */
  t: number;
  playerId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: NetAnim;
  map: string;
  location: string;
  /** 手上的武器（任務 11E） */
  weapon: string;
  /** 職業（外型；舊版伺服器沒有這個欄位時是旅人） */
  heroClass: string;
  /** false：對方斷線、伺服器還保留座位等他重連（任務 11C） */
  online: boolean;
};

/**
 * 零寬字元與雙向文字控制字元：可以用來偽裝名字或訊息、把文字倒過來顯示（任務 11F）。
 * 保留 ZWJ（U+200D）與變體選擇字元（U+FE0F 等）：組合 emoji（👨‍👩‍👧、❤️）需要它們。
 */
export const INVISIBLE_CHARS = /[\u00ad\u061c\u115f\u1160\u180e\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u206f\u3164\ufeff]/g;

/** 顯示名稱：去掉控制字元、看不見的字元與前後空白、限制長度；空的就用預設名稱 */
export function sanitizeName(raw: string | undefined, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(INVISIBLE_CHARS, '').trim();
  return [...(cleaned || fallback)].slice(0, NET.nameMaxLength).join('');
}

export function isNetAnim(value: string): value is NetAnim {
  return (netAnims as readonly string[]).includes(value);
}
