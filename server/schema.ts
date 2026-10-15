// 房間的同步狀態（Colyseus schema，只放渲染遠端玩家需要的欄位；驗證用的資料留在 WorldRoom 內部）。
// 用 schema() 定義，不用 decorator：esbuild / Node 不需要特別設定。
import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema(
  {
    /** 伺服器產生的玩家 id（之後接登入時換成帳號 id） */
    playerId: t.string(),
    /** 這個位置在送出端的時間（毫秒，送出端的時鐘），接收端依此插值 */
    t: t.float64(),
    name: t.string(),
    /** 膠囊中心的世界座標（與 playerRuntime.position 相同） */
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    yaw: t.float32(),
    anim: t.string(),
    /** 由伺服器依位置判斷 */
    map: t.string(),
    location: t.string(),
    /** 先保留，第一階段不做戰鬥 */
    health: t.uint8(),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const WorldState = schema(
  {
    instanceId: t.string(),
    players: t.map(PlayerState),
  },
  'WorldState',
);
export type WorldState = SchemaType<typeof WorldState>;
