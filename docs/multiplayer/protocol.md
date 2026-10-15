# 多人連線協定（版本 1）

定義在 `src/game-core/net/protocol.ts`，前端與伺服器共用。改格式時把 `PROTOCOL_VERSION` 加一，伺服器會拒絕版本不同的客戶端。

## 房間

- 名稱：`world`（`ROOM_NAME`），`joinOrCreate`。
- 建立選項：`{ instanceId?: string }`（預設 `main`，寫進房間 metadata）。
- 上限 16 人；伺服器每 50 ms 送一次狀態更新。

### 加入選項

```ts
{ protocol: 1, name?: string, at?: MoveMessage }
```

- `name`：去掉控制字元、最多 16 字；空的就用「旅人N」。
- `at`：目前位置。落在可玩範圍內就採用（讀檔後可能在其他地圖），否則伺服器指派晨曦谷地出生點附近；客戶端從初始狀態讀到自己的位置後移過去。

## 同步狀態（`server/schema.ts`）

```
WorldState { instanceId: string, players: Map<sessionId, PlayerState> }
PlayerState { playerId, t: float64, name, x/y/z: float32, yaw: float32, anim, map, location, health: uint8, online: boolean }
```

- `x/y/z`：膠囊中心的世界座標（腳底 = y − 0.78）。
- `t`：送出端算出這個位置的時間（送出端的 `performance.now()`，毫秒），接收端依此插值。
- `anim`：`idle | walk | run | jump | fall | land`。
- `map` / `location`：由伺服器依位置判斷（`dawnvale | glowmoss | mirrorlake | whispermeadow`；`overworld` 或室內 id）。
- `health`：先保留，第一階段固定 100。
- `online`：`false` 表示斷線中、伺服器保留座位等他重連（任務 11C）。

## 斷線續玩（任務 11C）

| 情況 | 伺服器 | 客戶端 |
|---|---|---|
| 網路短暫中斷（關閉代碼 1006 等） | `onDrop`：`online = false`，保留座位 20 秒（`NET.reconnectSeconds`） | 狀態 `reconnecting`；SDK 自動重連（最多 8 次、間隔上限 3 秒） |
| 在保留時間內重連成功 | `onReconnect`：`online = true`，允許下一則 `warp` 不受 1.5 秒間隔限制 | 同一個 sessionId；第一則送 `warp`（斷線期間走過的位置） |
| 保留逾時 | `onLeave`：移除 | — |
| 座位沒了（伺服器重啟 / 關機 4001 / 自動重連失敗） | — | 自動重新加入：1、2、4、8、10 秒…最多 3 分鐘，之後顯示「重新連線」 |
| 主動離開（中斷、回主選單、關閉視窗的 `pagehide`） | `onLeave`：馬上移除 | 狀態 `offline` |

## 客戶端 → 伺服器

| 訊息 | 內容 | 頻率 | 伺服器檢查 |
|---|---|---|---|
| `move` | `{ t, x, y, z, yaw, anim }`（不接受多餘欄位） | 有變化時每 50 ms，停著時每 1 秒 | 格式、可玩範圍、速度（依伺服器時間） |
| `warp` | 同 `move` | 位置不連續時（傳送、讀檔、重生、換地圖、進出室內） | 格式、可玩範圍、距上次 warp ≥ 1.5 秒 |

- 每個連線每秒超過 30 則的訊息直接丟棄；超過 60 則由 Colyseus 斷線。
- 格式不對、未知的訊息類型都忽略（記錄被拒次數與日誌）。

數值範圍：`x/z` ±100000、`y` −200 到 2000、`yaw` ±1000、`t` 0 到 1e10，都必須是有限數字。

## 伺服器 → 客戶端

| 訊息 | 內容 | 時機 |
|---|---|---|
| `correction` | `{ x, y, z, reason: 'speed' \| 'vertical' \| 'bounds' \| 'warp' }` | 不採用某則移動時，最多每 250 ms 一次；客戶端把本機玩家移到這個位置，下一則送 `move` |

## HTTP

- `GET /health` → `{ ok, protocol, rooms, players, uptimeSec }`（部署平台與 e2e 用）。
- `GET /__healthcheck` → `OK`（Colyseus 內建）。

## 未來擴充（還沒有）

`chat`、`interact`、`attack`、`skill`、`quest-event`、`pickup-item`。每次只加一類，補上格式、伺服器驗證與測試。
