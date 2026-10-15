# 多人連線協定（版本 3）

定義在 `src/game-core/net/protocol.ts`，前端與伺服器共用。改格式時把 `PROTOCOL_VERSION` 加一，伺服器會拒絕版本不同的客戶端。

## 房間

- 名稱：`world`（`ROOM_NAME`），`joinOrCreate`。
- 建立選項：`{ instanceId?: string }`（預設 `main`，寫進房間 metadata）。
- 上限 16 人；伺服器每 50 ms 送一次狀態更新。

### 加入選項

```ts
{ protocol: 3, name?: string, at?: MoveMessage, weapon?: string }
```

- `name`：去掉控制字元與看不見的字元（零寬、雙向控制）、最多 16 字、髒話換成 *；空的就用「旅人N」。
- `weapon`：手上的武器（`weapons.json` 的 id）；不認得就用預設的單手劍（任務 11E）。
- `at`：目前位置。落在可玩範圍內就採用（讀檔後可能在其他地圖），否則伺服器指派晨曦谷地出生點附近；客戶端從初始狀態讀到自己的位置後移過去。

## 同步狀態（`server/schema.ts`）

```
WorldState { instanceId: string, players: Map<sessionId, PlayerState> }
PlayerState { playerId, t: float64, name, x/y/z: float32, yaw: float32, anim, map, location, weapon, health: uint8, online: boolean }
```

- `x/y/z`：膠囊中心的世界座標（腳底 = y − 0.78）。
- `t`：送出端算出這個位置的時間（送出端的 `performance.now()`，毫秒），接收端依此插值。
- `anim`：`idle | walk | run | jump | fall | land`。
- `map` / `location`：由伺服器依位置判斷（`dawnvale | glowmoss | mirrorlake | whispermeadow`；`overworld` 或室內 id）。
- `weapon`：手上的武器（`fist | knife | sword`，任務 11E）。
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
| `action` | `{ kind: 'melee', t, move }` 或 `{ kind: 'spell', t, spell, phase: 'cast' \| 'release', yaw, tx?, tz? }` | 出招、開始施法、發動時（任務 11E） | 格式、招式 / 法術 id 在資料內、每秒最多 8 則、玩家在線 |
| `equip` | `{ weapon }` | 換武器時 | 格式、武器 id 在資料內 |
| `chat` | `{ channel: 'say' \| 'global' \| 'whisper', text, to? }` | 聊天輸入列送出（任務 11F） | 見下方「聊天」 |
| `chatHistory` | `{}` | 加入後註冊好 handler 時（每個連線一次） | 已給過就忽略 |

- 每個連線每秒超過 30 則的訊息直接丟棄；超過 60 則由 Colyseus 斷線。
- 格式不對、未知的訊息類型都忽略（記錄被拒次數與日誌）。

數值範圍：`x/z` ±100000、`y` −200 到 2000、`yaw` ±1000、`t` 0 到 1e10，都必須是有限數字。

## 伺服器 → 客戶端

| 訊息 | 內容 | 時機 |
|---|---|---|
| `correction` | `{ x, y, z, reason: 'speed' \| 'vertical' \| 'bounds' \| 'warp' }` | 不採用某則移動時，最多每 250 ms 一次；客戶端把本機玩家移到這個位置，下一則送 `move` |
| `action` | `action` 的內容加上 `sessionId` | 轉送給房間內其他人（不送回給自己） |
| `chat` | `ChatOut`：`{ id, t, channel: 'say' \| 'global' \| 'whisper' \| 'system', from?: { sessionId, name }, to?, text?, key?, vars? }` | 聊天與系統訊息 |
| `chatHistory` | `ChatOut[]`（全服頻道最近 20 則） | 回應 `chatHistory` |

### 聊天（任務 11F）

- **附近**（`say`）：同一張地圖、同一個室內、水平距離 30 m 內的人，包含自己（回顯，看到的是過濾後的文字）。**全服**（`global`）：所有人。**密語**（`whisper`）：依名字（不分大小寫）找人，對方收到 `from`，自己收到 `to` 為對方名字的回顯；找不到或同名不只一人時回系統訊息。
- **系統訊息**（`channel: 'system'`，`key` 是 i18n 字串）：其他人加入、離開（`chat.sys.joined` / `left`，斷線保留座位期間不發）；只給說話的人的：`chat.sys.tooFast`、`duplicate`、`globalCooldown`（`vars.seconds`）、`whisperNotFound`、`whisperAmbiguous`（`vars.name`）。
- **伺服器檢查**：格式（`strictObject`，多餘欄位與未知頻道拒絕）；清理（控制字元、零寬與雙向控制字元，保留組合 emoji 需要的 ZWJ 與 U+FE0F；折疊空白；120 字）；髒話換成 *（`src/data/chatBlocklist.json`）；每秒 2 則、每 10 秒 8 則；5 秒內同樣的內容擋下；全服頻道每 5 秒 1 則；離線中的人不能說話。名字取自伺服器上的玩家狀態，不信任客戶端。
- 聊天不寫資料庫；伺服器只在記憶體留全服頻道最近 20 則（重啟或 Render 休眠時消失）。靜音是客戶端本機的（`localStorage`），登入後改成帳號層級。

### 動作（任務 11E）

- `t` 與 `move` 的 `t` 同一個時間軸（送出端的 `performance.now()`）。接收端把動作排進那個人的佇列，呈現時間（插值用的「對方時間 − 呈現延遲」）到了才播放，動作和位置對得上；晚了 2 秒以上的直接丟掉（分頁在背景時累積的）。
- 只傳 id，動畫片段、播放速度、持續時間、特效由接收端依 `weapons.json` / `spells.json` 決定。
- **只是表現**：伺服器不結算傷害，接收端畫出的星光彈、流星不會命中本機的怪物（怪物仍是各客戶端各自一份，Phase 6 改由伺服器管理）。玩家之間不會互相傷害。

## HTTP

- `GET /health` → `{ ok, protocol, rooms, players, uptimeSec }`（部署平台與 e2e 用）。
- `GET /__healthcheck` → `OK`（Colyseus 內建）。

## 未來擴充（還沒有）

`interact`、`quest-event`、`pickup-item`、伺服器權威的戰鬥（Phase 6）、帳號層級的封鎖與檢舉（登入之後）。每次只加一類，補上格式、伺服器驗證與測試。
