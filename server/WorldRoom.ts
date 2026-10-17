// 世界房間（任務 11A / 11B）：玩家加入 / 離開、出生點、位置的驗證與廣播。
// 只負責「誰在場、在哪、什麼動作」；任務、背包、戰鬥仍是各客戶端自己的 LocalAuthority（決策 T-169）。
// 攻擊與施法（任務 11E）只轉送給其他人當作表現，不結算傷害（怪物還是各客戶端各自一份）。
// 聊天（任務 11F）：附近（同地圖、同室內、30 m 內）、全服、密語與系統訊息；伺服器清理文字、遮蔽髒話、限制頻率。
import { Room, ServerError, type AuthContext, type Client } from '@colyseus/core';
import chatBlocklist from '@/data/chatBlocklist.json';
import characters from '@/data/characters.json';
import interiorsRaw from '@/data/interiors.json';
import spellsRaw from '@/data/spells.json';
import weapons from '@/data/weapons.json';
import { DEFAULT_WEAPON, parseWeapons } from '@/game-core/combat/weapons';
import { DEFAULT_HERO_CLASS, isHeroClassId } from '@/game-core/character/heroClass';
import { acceptInWindow, ChatFilter, sameName, sanitizeChat } from '@/game-core/net/chat';
import {
  actionMessageSchema,
  chatMessageSchema,
  ClientMessage,
  equipMessageSchema,
  joinOptionsSchema,
  moveMessageSchema,
  NET,
  PROTOCOL_VERSION,
  sanitizeName,
  ServerMessage,
  timeRequestSchema,
  warpMessageSchema,
  type ChatOut,
  type CorrectionMessage,
  type CorrectionReason,
  type MoveMessage,
  type RemoteActionMessage,
  type TimeReply,
} from '@/game-core/net/protocol';
import { acceptRate, canWarp, checkMove, maxLungeIn, moveLimitsFor, zoneAt, type InteriorZone, type Vec3 } from '@/game-core/net/moveValidation';
import { NEW_GAME_SPAWN } from '@/game-core/world/maps';
import { terrainHeight } from '@/game-core/world/terrain';
import { isAllowedOrigin, type OriginRule } from './origins';
import { PlayerState, WorldState } from './schema';

const traveler = characters.find((c) => c.id === 'traveler');
if (!traveler) throw new Error('characters.json 沒有 traveler');
const LIMITS = moveLimitsFor(traveler.locomotion, maxLungeIn(weapons));
const FOOT_OFFSET = traveler.capsule.halfHeight + traveler.capsule.radius;
const WEAPONS = parseWeapons(weapons);
const SPELL_IDS = new Set(spellsRaw.map((s) => s.id));
const CHAT_FILTER = new ChatFilter(chatBlocklist.words);
const INTERIORS: InteriorZone[] = interiorsRaw.map((i) => ({ id: i.id, origin: [i.origin[0]!, i.origin[1]!] as const }));

/** 每個連線在伺服器內部的追蹤資料（不同步給客戶端） */
type Track = {
  last: Vec3;
  lastAt: number;
  lastWarpAt: number | null;
  lastCorrectionAt: number;
  rate: { windowStart: number; count: number };
  /** 動作（攻擊、施法）另外限制頻率 */
  actionRate: { windowStart: number; count: number };
  /** 聊天（任務 11F）：每秒、每 10 秒的次數，全服頻道上一則的時間，上一則內容（擋重複），是否已經要過紀錄 */
  chatRate: { windowStart: number; count: number };
  chatTimes: number[];
  lastGlobalAt: number;
  lastChat: { text: string; at: number } | null;
  historySent: boolean;
  /** 上次回覆對時的時間（毫秒） */
  lastTimeAt: number;
  rejected: number;
};

export type WorldRoomOptions = { instanceId?: string };

let nextPlayerNumber = 1;

export class WorldRoom extends Room<{ state: WorldState }> {
  /** 連線來源允許清單（createGameServer 設定；空的 = 全部允許，任務 11D） */
  static originRules: OriginRule[] = [];
  maxClients = NET.maxClients;
  maxMessagesPerSecond = NET.hardMessagesPerSecond;
  state = new WorldState();
  /** 測試可以換掉時鐘 */
  now: () => number = () => Date.now();
  /** 斷線後保留座位的秒數（測試可以縮短） */
  reconnectSeconds: number = NET.reconnectSeconds;
  private readonly tracks = new Map<string, Track>();
  /** 全服頻道最近的訊息（新加入的人要紀錄時給） */
  private readonly globalHistory: ChatOut[] = [];
  private nextChatId = 1;

  onCreate(options: WorldRoomOptions = {}): void {
    this.state.instanceId = options.instanceId ?? 'main';
    this.setPatchRate(NET.patchMs);
    void this.setMetadata({ instanceId: this.state.instanceId });

    this.onMessage(ClientMessage.move, (client: Client, raw: unknown) => this.handleMove(client, raw, false));
    this.onMessage(ClientMessage.warp, (client: Client, raw: unknown) => this.handleMove(client, raw, true));
    this.onMessage(ClientMessage.action, (client: Client, raw: unknown) => this.handleAction(client, raw));
    this.onMessage(ClientMessage.equip, (client: Client, raw: unknown) => this.handleEquip(client, raw));
    this.onMessage(ClientMessage.chat, (client: Client, raw: unknown) => this.handleChat(client, raw));
    this.onMessage(ClientMessage.chatHistory, (client: Client) => this.handleChatHistory(client));
    this.onMessage(ClientMessage.time, (client: Client, raw: unknown) => this.handleTime(client, raw));
    // 不認得的訊息一律忽略（不讓客戶端觸發未定義的行為）
    this.onMessage('*', (client: Client, type: string | number) => {
      console.warn(`[world] 忽略未知訊息 ${String(type)}（${client.sessionId}）`);
    });
  }

  /** 比對房間的 HTTP 請求（static：在保留座位之前執行）：來源不在允許清單內就拒絕。WebSocket 升級另外在 transport 的 beforeUpgrade 檢查 */
  static async onAuth(_token: string, _options: unknown, context: AuthContext): Promise<boolean> {
    const origin = context.headers.get('origin');
    if (!isAllowedOrigin(origin, WorldRoom.originRules)) {
      console.warn(`[world] 拒絕來源 ${origin} 加入`);
      throw new ServerError(403, 'origin not allowed');
    }
    return true;
  }

  onJoin(client: Client, rawOptions?: unknown): void {
    const parsed = joinOptionsSchema.safeParse(rawOptions ?? {});
    if (!parsed.success || parsed.data.protocol !== PROTOCOL_VERSION) {
      throw new Error(`協定版本不符（伺服器 ${PROTOCOL_VERSION}）`);
    }
    const options = parsed.data;
    const number = nextPlayerNumber++;
    const player = new PlayerState();
    player.playerId = `p${number}-${client.sessionId.slice(0, 4)}`;
    // 名字也過濾髒話（名字會出現在名牌與聊天裡）
    player.name = CHAT_FILTER.mask(sanitizeName(options.name, `旅人${number}`));
    player.health = 100;
    player.online = true;
    player.weapon = options.weapon && WEAPONS.weapons.has(options.weapon as never) ? options.weapon : DEFAULT_WEAPON;
    player.heroClass = isHeroClassId(options.heroClass) ? options.heroClass : DEFAULT_HERO_CLASS;

    // 客戶端帶來的位置在可玩範圍內就採用（讀檔後可能在其他地圖）；否則放在出生點附近，彼此錯開
    const at = options.at;
    const zone = at ? zoneAt(at.x, at.z, INTERIORS) : null;
    if (at && zone) {
      Object.assign(player, { t: at.t, x: at.x, y: at.y, z: at.z, yaw: at.yaw, anim: at.anim, map: zone.map, location: zone.location });
    } else {
      const angle = (number % 8) * (Math.PI / 4);
      const x = NEW_GAME_SPAWN.x + Math.sin(angle) * 1.5;
      const z = NEW_GAME_SPAWN.z + Math.cos(angle) * 1.5;
      Object.assign(player, { x, y: terrainHeight(x, z) + FOOT_OFFSET + 0.05, z, yaw: Math.PI, anim: 'idle', map: 'dawnvale', location: 'overworld' });
    }
    this.state.players.set(client.sessionId, player);
    this.tracks.set(client.sessionId, {
      last: { x: player.x, y: player.y, z: player.z },
      lastAt: this.now(),
      lastWarpAt: null,
      lastCorrectionAt: 0,
      rate: { windowStart: this.now(), count: 0 },
      actionRate: { windowStart: this.now(), count: 0 },
      chatRate: { windowStart: this.now(), count: 0 },
      chatTimes: [],
      lastGlobalAt: -Infinity,
      lastChat: null,
      historySent: false,
      lastTimeAt: -Infinity,
      rejected: 0,
    });
    // 加入的人自己還沒註冊訊息 handler，系統訊息只送給其他人
    this.system('chat.sys.joined', { name: player.name }, { except: client });
    // 被指派出生點時，客戶端從初始狀態讀到自己的位置後移過去（加入當下送訊息會比客戶端註冊 handler 早到）
    console.info(`[world] 加入 ${player.name}（${client.sessionId}），目前 ${this.clients.length} 人`);
  }

  /**
   * 非自願斷線（網路中斷、分頁被關、伺服器端偵測到 ping 逾時）：保留座位 NET.reconnectSeconds 秒，
   * 角色留在原地、標記為離線；客戶端在時間內重連回來就是同一個人（同一個 sessionId），逾時才呼叫 onLeave（任務 11C）。
   */
  onDrop(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.online = false;
    console.info(`[world] 斷線 ${player?.name ?? client.sessionId}，保留座位 ${this.reconnectSeconds} 秒`);
    // 逾時時 Colyseus 會 reject 並接著呼叫 onLeave；這裡只需要避免未處理的 rejection
    this.allowReconnection(client, this.reconnectSeconds).catch(() => undefined);
  }

  /** 斷線後在時間內重連回來：恢復在線；斷線期間客戶端自己走動過，下一則位置當作合法的瞬移 */
  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    const track = this.tracks.get(client.sessionId);
    if (player) player.online = true;
    if (track) {
      track.lastAt = this.now();
      track.lastWarpAt = null;
    }
    console.info(`[world] 重新連線 ${player?.name ?? client.sessionId}`);
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.tracks.delete(client.sessionId);
    if (player) this.system('chat.sys.left', { name: player.name });
    console.info(`[world] 離開 ${player?.name ?? client.sessionId}，目前 ${this.clients.length} 人`);
  }

  private handleMove(client: Client, raw: unknown, warp: boolean): void {
    const player = this.state.players.get(client.sessionId);
    const track = this.tracks.get(client.sessionId);
    if (!player || !track) return;
    const now = this.now();
    if (!acceptRate(track.rate, now, NET.softMessagesPerSecond)) return;
    const parsed = (warp ? warpMessageSchema : moveMessageSchema).safeParse(raw);
    if (!parsed.success) {
      track.rejected++;
      return;
    }
    const msg = parsed.data;
    const zone = zoneAt(msg.x, msg.z, INTERIORS);
    if (!zone) return this.reject(client, player, track, 'bounds');
    if (warp) {
      if (!canWarp(track.lastWarpAt, now, NET.warpMinIntervalMs)) return this.reject(client, player, track, 'warp');
      track.lastWarpAt = now;
    } else {
      const check = checkMove(track.last, msg, (now - track.lastAt) / 1000, LIMITS);
      if (!check.ok) return this.reject(client, player, track, check.reason);
    }
    this.accept(player, track, msg, zone, now);
  }

  /** 攻擊、施法：檢查格式、頻率與資料中的 id，轉送給其他人（任務 11E） */
  private handleAction(client: Client, raw: unknown): void {
    const player = this.state.players.get(client.sessionId);
    const track = this.tracks.get(client.sessionId);
    if (!player || !track || !player.online) return;
    const now = this.now();
    if (!acceptRate(track.rate, now, NET.softMessagesPerSecond) || !acceptRate(track.actionRate, now, NET.actionsPerSecond)) return;
    const parsed = actionMessageSchema.safeParse(raw);
    const msg = parsed.success ? parsed.data : null;
    const known = msg && (msg.kind === 'melee' ? WEAPONS.moves.has(msg.move) : SPELL_IDS.has(msg.spell));
    if (!msg || !known) {
      track.rejected++;
      return;
    }
    const out: RemoteActionMessage = { ...msg, sessionId: client.sessionId };
    this.broadcast(ServerMessage.action, out, { except: client });
  }

  /** 換武器：只接受資料中的武器，寫進同步狀態 */
  private handleEquip(client: Client, raw: unknown): void {
    const player = this.state.players.get(client.sessionId);
    const track = this.tracks.get(client.sessionId);
    if (!player || !track) return;
    if (!acceptRate(track.rate, this.now(), NET.softMessagesPerSecond)) return;
    const parsed = equipMessageSchema.safeParse(raw);
    if (!parsed.success || !WEAPONS.weapons.has(parsed.data.weapon as never)) {
      track.rejected++;
      return;
    }
    player.weapon = parsed.data.weapon;
    if (isHeroClassId(parsed.data.heroClass)) player.heroClass = parsed.data.heroClass;
  }

  /**
   * 聊天（任務 11F）：格式 → 頻率（每秒、每 10 秒、全服間隔）→ 清理與遮蔽 → 重複 → 依頻道送出。
   * 被擋下時回一則系統訊息給說話的人（不默默丟掉，玩家才知道為什麼沒送出）。
   */
  private handleChat(client: Client, raw: unknown): void {
    const player = this.state.players.get(client.sessionId);
    const track = this.tracks.get(client.sessionId);
    if (!player || !track || !player.online) return;
    const now = this.now();
    if (!acceptRate(track.rate, now, NET.softMessagesPerSecond)) return;
    const parsed = chatMessageSchema.safeParse(raw);
    if (!parsed.success) {
      track.rejected++;
      return;
    }
    const msg = parsed.data;
    const text = CHAT_FILTER.mask(sanitizeChat(msg.text));
    if (!text || (msg.channel === 'whisper' && !msg.to)) {
      track.rejected++;
      return;
    }
    if (!acceptRate(track.chatRate, now, NET.chatPerSecond) || !acceptInWindow(track.chatTimes, now, NET.chatBurstWindowMs, NET.chatBurst)) {
      track.rejected++;
      return this.systemTo(client, 'chat.sys.tooFast');
    }
    if (track.lastChat && track.lastChat.text === text && now - track.lastChat.at < NET.chatDuplicateMs) {
      track.rejected++;
      return this.systemTo(client, 'chat.sys.duplicate');
    }
    if (msg.channel === 'global' && now - track.lastGlobalAt < NET.globalCooldownMs) {
      track.rejected++;
      return this.systemTo(client, 'chat.sys.globalCooldown', { seconds: String(Math.ceil((NET.globalCooldownMs - (now - track.lastGlobalAt)) / 1000)) });
    }

    const from = { sessionId: client.sessionId, name: player.name };
    if (msg.channel === 'whisper') {
      const targets = [...this.state.players.entries()].filter(([id, p]) => id !== client.sessionId && sameName(p.name, msg.to!));
      if (targets.length === 0) return this.systemTo(client, 'chat.sys.whisperNotFound', { name: msg.to! });
      if (targets.length > 1) return this.systemTo(client, 'chat.sys.whisperAmbiguous', { name: msg.to! });
      const [targetId, target] = targets[0]!;
      const recipient = this.clients.find((c) => c.sessionId === targetId);
      if (!recipient || !target.online) return this.systemTo(client, 'chat.sys.whisperNotFound', { name: msg.to! });
      this.remember(track, text, now);
      recipient.send(ServerMessage.chat, this.chatOut({ channel: 'whisper', from, text }, now));
      client.send(ServerMessage.chat, this.chatOut({ channel: 'whisper', from, to: target.name, text }, now));
      return;
    }

    this.remember(track, text, now);
    const out = this.chatOut({ channel: msg.channel, from, text }, now);
    if (msg.channel === 'global') {
      track.lastGlobalAt = now;
      this.globalHistory.push(out);
      if (this.globalHistory.length > NET.chatHistory) this.globalHistory.shift();
      this.broadcast(ServerMessage.chat, out);
      return;
    }
    // 附近：同一張地圖、同一個室內（室內的座標另外偏移）、水平距離 chatSayRadius 內，包含自己
    for (const c of this.clients) {
      const p = this.state.players.get(c.sessionId);
      if (!p || !p.online || p.map !== player.map || p.location !== player.location) continue;
      if (Math.hypot(p.x - player.x, p.z - player.z) <= NET.chatSayRadius) c.send(ServerMessage.chat, out);
    }
  }

  /** 剛加入時要全服頻道最近的紀錄：每個連線只給一次 */
  private handleChatHistory(client: Client): void {
    const track = this.tracks.get(client.sessionId);
    if (!track || track.historySent) return;
    track.historySent = true;
    client.send(ServerMessage.chatHistory, this.globalHistory);
  }

  /** 對時（共享日光）：每個連線每秒最多回一次，格式不符就忽略 */
  private handleTime(client: Client, raw: unknown): void {
    const track = this.tracks.get(client.sessionId);
    const parsed = timeRequestSchema.safeParse(raw);
    if (!track || !parsed.success) return;
    const now = this.now();
    if (now - track.lastTimeAt < 1000) return;
    track.lastTimeAt = now;
    client.send(ServerMessage.time, { t: parsed.data.t, now } satisfies TimeReply);
  }

  private remember(track: Track, text: string, now: number): void {
    track.lastChat = { text, at: now };
  }

  private chatOut(fields: Omit<ChatOut, 'id' | 't'>, now: number): ChatOut {
    return { id: this.nextChatId++, t: now, ...fields };
  }

  /** 系統訊息給所有人（加入 / 離開） */
  private system(key: string, vars: Record<string, string>, options?: { except: Client }): void {
    this.broadcast(ServerMessage.chat, this.chatOut({ channel: 'system', key, vars }, this.now()), options);
  }

  /** 系統訊息只給一個人（說話太快、找不到密語對象等） */
  private systemTo(client: Client, key: string, vars?: Record<string, string>): void {
    client.send(ServerMessage.chat, this.chatOut({ channel: 'system', key, ...(vars ? { vars } : {}) }, this.now()));
  }

  private accept(player: PlayerState, track: Track, msg: MoveMessage, zone: { map: string; location: string }, now: number): void {
    player.t = msg.t;
    player.x = msg.x;
    player.y = msg.y;
    player.z = msg.z;
    player.yaw = msg.yaw;
    player.anim = msg.anim;
    player.map = zone.map;
    player.location = zone.location;
    track.last = { x: msg.x, y: msg.y, z: msg.z };
    track.lastAt = now;
  }

  /** 不採用這次的位置：狀態保持上一個合法位置，並請客戶端拉回去（有頻率限制，避免網路延遲時一直送） */
  private reject(client: Client, player: PlayerState, track: Track, reason: CorrectionReason): void {
    track.rejected++;
    const now = this.now();
    if (now - track.lastCorrectionAt < NET.correctionMinIntervalMs) return;
    track.lastCorrectionAt = now;
    const message: CorrectionMessage = { x: player.x, y: player.y, z: player.z, reason };
    client.send(ServerMessage.correction, message);
  }

  /** 測試與日誌用：某個連線被拒絕的次數 */
  rejectedCount(sessionId: string): number {
    return this.tracks.get(sessionId)?.rejected ?? 0;
  }
}
