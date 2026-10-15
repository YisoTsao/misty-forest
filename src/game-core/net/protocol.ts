// 多人連線協定（任務 11A，docs/multiplayer/protocol.md）：前端（src/net）與遊戲伺服器（server/）共用的
// 房間名、訊息名、訊息格式與頻率常數。只放純資料與 zod 格式，不 import Colyseus，前端不會帶入伺服器程式。
import { z } from 'zod';

/** 協定版本：伺服器拒絕版本不同的客戶端，避免新舊版本互相送錯格式 */
export const PROTOCOL_VERSION = 1;

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
  /** 座位沒了（伺服器重啟、休眠喚醒、保留逾時）時，自動重新加入的間隔（毫秒，依序使用、最後一個重複） */
  rejoinDelaysMs: [1000, 2000, 4000, 8000, 10000],
  /** 自動重新加入最久嘗試多久（毫秒）：涵蓋 Render 免費方案從休眠喚醒的時間 */
  rejoinGiveUpMs: 180_000,
} as const;

/** 客戶端 → 伺服器 */
export const ClientMessage = {
  /** 每 50 ms 一次：目前位置、朝向、動畫 */
  move: 'move',
  /** 合法的瞬移（地圖出入口、進出室內、落水重生、讀檔）：只檢查頻率與落點範圍 */
  warp: 'warp',
} as const;

/** 伺服器 → 客戶端 */
export const ServerMessage = {
  /** 移動沒通過驗證：把本機玩家拉回伺服器上的最後合法位置 */
  correction: 'correction',
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

export const joinOptionsSchema = z.object({
  protocol: z.number().int(),
  name: z.string().max(64).optional(),
  /** 加入時所在的位置；在可玩範圍內才採用，否則由伺服器指派出生點 */
  at: moveMessageSchema.optional(),
});
export type JoinOptions = z.infer<typeof joinOptionsSchema>;

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
  /** false：對方斷線、伺服器還保留座位等他重連（任務 11C） */
  online: boolean;
};

/** 顯示名稱：去掉控制字元與前後空白、限制長度；空的就用預設名稱 */
export function sanitizeName(raw: string | undefined, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return [...(cleaned || fallback)].slice(0, NET.nameMaxLength).join('');
}

export function isNetAnim(value: string): value is NetAnim {
  return (netAnims as readonly string[]).includes(value);
}
