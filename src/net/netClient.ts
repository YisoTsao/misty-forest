// 多人連線的客戶端 adapter（任務 11A / 11B / 11C）：Web 與 Electron 共用。
// 連線 / 中斷 / 重新連線、把房間狀態整理成遠端玩家清單、每 50 ms 回報本機位置、套用伺服器的位置修正。
// 斷線續玩（11C）：網路短暫中斷時 SDK 自動重連回同一個座位（伺服器保留 20 秒）；座位沒了（伺服器重啟、
// 休眠喚醒、保留逾時）時自動重新加入，最多嘗試 3 分鐘，之後才顯示「重新連線」按鈕。
// 聊天（任務 11F）：送出輸入列的內容（指令在本機解析）、收聊天與全服紀錄。
// 只有這個檔案 import Colyseus SDK；其他模組透過 netStore 與這裡的函式使用。
import { Client, type Room } from '@colyseus/sdk';
import {
  ClientMessage,
  isNetAnim,
  KICKED_ELSEWHERE,
  NET,
  PROTOCOL_VERSION,
  ROOM_NAME,
  sanitizeName,
  serverTimeOffset,
  ServerMessage,
  type ChatOut,
  type CorrectionMessage,
  type MoveMessage,
  type NetAnim,
  type RemoteActionMessage,
  type RemotePlayerView,
  type TimeReply,
} from '@/game-core/net/protocol';
import { parseChatInput } from '@/game-core/net/chat';
import { supabase } from '@/account/supabase';
import { authority } from '@/game/authority';
import { getCharacterDef, PLAYER_CHARACTER_ID } from '@/game/character/characters';
import { t } from '@/game/i18n';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen, useGameStore } from '@/game/state/gameStore';
import { useUiStore } from '@/game/state/uiStore';
import { setPlayMode } from '@/online/onlineStore';
import { endOnlineSession } from '@/online/onlineSession';
import { syncServerTime } from '@/game/world/worldClock';
import { clearBubbles, localNotice, mute, receiveChat, unmute, useChatStore } from './chatStore';
import { rememberName, savedName, serverUrl } from './config';
import { createRemoteEntry, initialNetState, remoteRuntime, useNetStore, type NetMember } from './netStore';

/** 伺服器狀態中一個玩家的欄位（Colyseus 解碼後的物件，只讀需要的欄位） */
type PlayerFields = Omit<RemotePlayerView, 'sessionId' | 'anim'> & { anim: string };
type PlayersLike = { forEach(cb: (player: PlayerFields, sessionId: string) => void): void; get(id: string): PlayerFields | undefined; size: number };
type WorldStateLike = { players?: PlayersLike };

const def = getCharacterDef(PLAYER_CHARACTER_ID);
const FOOT_OFFSET = def.capsule.halfHeight + def.capsule.radius;

let room: Room | null = null;
let sendTimer: number | null = null;
/** 自己離開（中斷連線）時不顯示斷線錯誤 */
let leavingOnPurpose = false;
let lastOptions: { name?: string; url?: string } = {};
let firstState = true;
/** 自動重新加入的排程（座位沒了之後） */
let rejoin: { timer: number | null; startedAt: number; attempt: number } | null = null;
/** 重連回同一個座位後，下一次送出改送 warp（斷線期間自己走動過，伺服器把它當合法的位置跳動） */
let forceWarp = false;

/** 本機玩家目前的位置、朝向與動畫（送給伺服器的格式） */
function localMove(): MoveMessage {
  const p = playerRuntime.position;
  const anim = playerRuntime.locomotion.anim;
  // 時間用算出這個位置的那一幀，不用送出的時間：畫面掉幀時兩者會差一幀，對方算出的速度會忽快忽慢
  return { t: playerRuntime.positionAt || performance.now(), x: p.x, y: p.y, z: p.z, yaw: playerRuntime.locomotion.facingYaw, anim: isNetAnim(anim) ? anim : 'idle' };
}

export function connectionName(): string {
  return sanitizeName(lastOptions.name ?? savedName(), t('net.defaultName'));
}

/** 連到遊戲伺服器並加入世界房間；已連線或連線中時不重複連 */
export async function connect(options: { name?: string; url?: string } = {}): Promise<boolean> {
  cancelRejoin();
  const status = useNetStore.getState().status;
  if (room || status === 'connecting') return status === 'connected';
  lastOptions = { name: options.name ?? lastOptions.name, url: options.url ?? lastOptions.url };
  useNetStore.setState({ ...initialNetState, status: 'connecting', serverUrl: options.url ?? serverUrl() });
  const ok = await join();
  if (!ok) useNetStore.setState({ status: 'error' });
  return ok;
}

/** 登入帳號的 access token：伺服器用它確認是哪個帳號（同一帳號只能一處連線）；沒登入或取不到就不帶 */
async function accountToken(): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? undefined;
}

/** 加入房間（第一次連線與自動重新加入共用）；失敗時把原因寫進 error、回傳 false */
async function join(): Promise<boolean> {
  const url = lastOptions.url ?? serverUrl();
  const name = connectionName();
  rememberName(name);
  // 加入期間若發生讀檔 / 新遊戲的位置跳動，連上後要補送 warp：以送出加入時的計數為準
  const warpSeqAtJoin = playerRuntime.warpSeq;
  let joined: Room;
  try {
    const client = new Client(url);
    joined = await client.joinOrCreate(ROOM_NAME, {
      protocol: PROTOCOL_VERSION,
      name,
      at: localMove(),
      weapon: authority.getState().player.weapon,
      heroClass: authority.getState().player.heroClass,
      account: await accountToken(),
    });
  } catch (err) {
    useNetStore.setState({ error: `${t('net.connectFailed')}：${errorText(err)}` });
    return false;
  }
  // 自動重連回同一個座位：總時間約 15 秒，短於伺服器保留座位的 NET.reconnectSeconds
  joined.reconnection.maxRetries = NET.reconnectRetries;
  joined.reconnection.maxDelay = NET.reconnectMaxDelayMs;
  joined.reconnection.minUptime = NET.reconnectMinUptimeMs;
  room = joined;
  firstState = true;
  forceWarp = false;
  useNetStore.setState({ status: 'connected', serverUrl: url, roomId: joined.roomId, sessionId: joined.sessionId, error: null });
  joined.onStateChange((state: WorldStateLike) => syncState(state));
  joined.onMessage(ServerMessage.correction, (msg: CorrectionMessage) => applyCorrection(msg));
  joined.onMessage(ServerMessage.action, (msg: RemoteActionMessage) => receiveAction(msg));
  joined.onMessage(ServerMessage.chat, (msg: ChatOut) => receiveChat(msg));
  joined.onMessage(ServerMessage.time, (reply: TimeReply) => syncServerTime(Date.now() + serverTimeOffset(reply, Date.now())));
  joined.onMessage(ServerMessage.chatHistory, (list: ChatOut[]) => {
    // 重新加入時紀錄可能已經在本機了：只補上沒看過的
    const seen = new Set(useChatStore.getState().lines.map((l) => l.id));
    for (const msg of list) if (!seen.has(msg.id)) receiveChat(msg, { history: true });
  });
  joined.onError((code, message) => console.warn(`[net] 房間錯誤 ${code}：${message ?? ''}`));
  joined.onDrop((code) => onDropped(code));
  joined.onReconnect(() => onReconnected());
  joined.onLeave((code, reason) => onLeft(code, reason));
  startSending(warpSeqAtJoin);
  // handler 註冊好之後才要全服頻道的紀錄與對時（加入當下伺服器送的訊息會比 handler 早到）
  joined.send(ClientMessage.chatHistory, {});
  requestTime();
  return true;
}

/** 自己中斷連線（回到主選單、在面板按「中斷」） */
export async function disconnect(): Promise<void> {
  cancelRejoin();
  const current = room;
  if (!current) {
    if (useNetStore.getState().status !== 'connecting') useNetStore.setState({ ...initialNetState });
    return;
  }
  leavingOnPurpose = true;
  try {
    await current.leave(true);
  } catch {
    // 伺服器已經不在時 leave 會失敗；照樣清除本機狀態
    onLeft(1000, 'consented');
  }
}

/** 手動重新連線（「重新連線」按鈕）：以同樣的名字重新加入 */
export async function reconnect(options: { name?: string } = lastOptions): Promise<boolean> {
  await disconnect();
  return connect({ ...lastOptions, ...options });
}

/** 連線非自願中斷：SDK 開始自動重連回同一個座位 */
function onDropped(code: number): void {
  // SDK 每次重試失敗都會再觸發一次 onDrop：只在剛斷線時提示一次
  if (useNetStore.getState().status !== 'connected') return;
  console.warn(`[net] 連線中斷（${code}），自動重新連線中`);
  useNetStore.setState({ status: 'reconnecting' });
  useUiStore.getState().pushToast({ textKey: 'net.unstable' });
}

/** 重連回同一個座位：其他人看到的還是同一個人 */
/** 對時（共享日光）：之後的日夜以伺服器時間換算 */
function requestTime(): void {
  room?.send(ClientMessage.time, { t: Date.now() });
}

function onReconnected(): void {
  console.info('[net] 已重新連線');
  requestTime();
  forceWarp = true;
  useNetStore.setState({ status: 'connected', error: null });
  useUiStore.getState().pushToast({ textKey: 'net.restored' });
}

function onLeft(code: number, reason?: string): void {
  if (!room) return;
  room = null;
  stopSending();
  clearRemotes();
  const purposeful = leavingOnPurpose;
  leavingOnPurpose = false;
  if (purposeful) {
    useNetStore.setState({ ...initialNetState });
    return;
  }
  // 同一帳號在別處登入：先進的這裡被踢下線，不自動重新加入（任務 11M-7）
  if (reason === KICKED_ELSEWHERE) {
    console.warn('[net] 同一帳號在別處登入，這裡的線上連線已中斷');
    useNetStore.setState({ ...initialNetState });
    returnToTitleAfterKick();
    return;
  }
  // 座位沒了（伺服器重啟、休眠喚醒、保留逾時、自動重連失敗）：自動重新加入
  console.warn(`[net] 與伺服器的連線中斷（${code}${reason ? `：${reason}` : ''}），自動重新加入`);
  useNetStore.setState({ status: 'reconnecting', roomId: null, sessionId: null, playerId: null, playerCount: 0, members: [] });
  startRejoin();
}

/**
 * 同一帳號在別處登入、這裡被踢下線：角色回到首頁並說明原因（任務 11M-9）。
 * 不呼叫 returnToTitle 的存檔：這一端的進度可能比另一台舊，存進雲端會覆蓋新進度。
 */
function returnToTitleAfterKick(): void {
  if (currentScreen() === 'playing') useGameStore.getState().send('pause');
  if (currentScreen() === 'paused') useGameStore.getState().send('returnToTitle');
  setPlayMode('offline');
  void endOnlineSession();
  useUiStore.getState().showMessage({ titleKey: 'net.kickedTitle', bodyKey: 'net.kickedBody' });
}

function startRejoin(): void {
  cancelRejoin();
  rejoin = { timer: null, startedAt: performance.now(), attempt: 0 };
  scheduleRejoin();
}

function scheduleRejoin(): void {
  const r = rejoin;
  if (!r) return;
  const delays = NET.rejoinDelaysMs;
  const delay = delays[Math.min(r.attempt, delays.length - 1)]!;
  if (performance.now() - r.startedAt + delay > NET.rejoinGiveUpMs) {
    // 放棄：顯示離線與「重新連線」按鈕
    rejoin = null;
    useNetStore.setState({ status: 'error', error: t('net.disconnected') });
    useUiStore.getState().pushToast({ textKey: 'net.disconnected' });
    return;
  }
  r.timer = window.setTimeout(() => void attemptRejoin(r), delay);
}

async function attemptRejoin(r: NonNullable<typeof rejoin>): Promise<void> {
  if (rejoin !== r || room) return;
  r.timer = null;
  r.attempt++;
  const ok = await join();
  // 等待期間玩家可能已經中斷或手動重新連線
  if (rejoin !== r) return;
  if (ok) {
    rejoin = null;
    useUiStore.getState().pushToast({ textKey: 'net.restored' });
  } else {
    scheduleRejoin();
  }
}

function cancelRejoin(): void {
  if (rejoin?.timer != null) window.clearTimeout(rejoin.timer);
  rejoin = null;
}

/** 關閉視窗 / 分頁時主動離開：其他人馬上看到離開，伺服器不必保留座位（盡力而為，關閉時不一定送得出去） */
export function leaveOnPageHide(): void {
  window.addEventListener('pagehide', () => {
    if (!room) return;
    leavingOnPurpose = true;
    void room.leave(true).catch(() => undefined);
  });
}

/** 依房間狀態更新遠端玩家：快照放進插值緩衝，名單改變時才更新 store */
function syncState(state: WorldStateLike): void {
  const players = state.players;
  const self = room?.sessionId;
  if (!players || !self) return;
  const initial = firstState;
  const now = performance.now();
  const seen = new Set<string>();
  players.forEach((p, sessionId) => {
    if (sessionId === self) return;
    seen.add(sessionId);
    const view: RemotePlayerView = {
      sessionId,
      t: p.t,
      playerId: p.playerId,
      name: p.name,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      anim: (isNetAnim(p.anim) ? p.anim : 'idle') as NetAnim,
      map: p.map,
      location: p.location,
      weapon: p.weapon,
      heroClass: p.heroClass || 'traveler',
      online: p.online !== false,
    };
    let entry = remoteRuntime.players.get(sessionId);
    const fresh = !entry || entry.view.t !== view.t;
    if (entry) entry.view = view;
    else remoteRuntime.players.set(sessionId, (entry = createRemoteEntry(view)));
    // 只有對方送出新位置時才記錄：快照的時間是對方送出的時間，插值不受伺服器更新間隔與網路抖動影響
    if (fresh) {
      const target = entry.clock.update(now, view.t);
      // 這一包比最快的那一包晚到多少：依此調整呈現延遲
      entry.delay.observe(now - view.t - target);
      entry.buffer.push({ t: view.t, x: view.x, y: view.y, z: view.z, yaw: view.yaw });
    }
  });
  for (const id of [...remoteRuntime.players.keys()]) if (!seen.has(id)) remoteRuntime.players.delete(id);

  // 被伺服器指派出生點時（沒有採用本機帶過去的位置），移到伺服器的位置
  const mine = players.get(self);
  if (firstState && mine) {
    firstState = false;
    useNetStore.setState({ playerId: mine.playerId });
    const p = playerRuntime.position;
    if (Math.hypot(mine.x - p.x, mine.z - p.z) > 3) applyCorrection({ x: mine.x, y: mine.y, z: mine.z, reason: 'bounds' });
  }
  updateMembers(players.size, !initial);
}

function updateMembers(count: number, notify: boolean): void {
  const store = useNetStore.getState();
  const members: NetMember[] = [...remoteRuntime.players.values()].map((e) => ({ sessionId: e.view.sessionId, name: e.view.name, online: e.view.online, heroClass: e.view.heroClass }));
  const before = new Map(store.members.map((m) => [m.sessionId, m]));
  const changed =
    members.length !== before.size ||
    members.some((m) => {
      const b = before.get(m.sessionId);
      return b?.name !== m.name || b.online !== m.online || b.heroClass !== m.heroClass;
    });
  if (!changed && store.playerCount === count) return;
  // 加入 / 離開的通知（剛連上時的既有玩家不通知）
  if (notify) {
    const after = new Set(members.map((m) => m.sessionId));
    for (const m of members) if (!before.has(m.sessionId)) useUiStore.getState().pushToast({ textKey: 'net.joined', vars: { name: m.name } });
    for (const m of store.members) if (!after.has(m.sessionId)) useUiStore.getState().pushToast({ textKey: 'net.left', vars: { name: m.name } });
  }
  useNetStore.setState({ members, playerCount: count });
}

/** 其他玩家的攻擊、施法：放進對方的動作佇列，RemotePlayers 呈現到那一刻時播放（任務 11E） */
function receiveAction(msg: RemoteActionMessage): void {
  const entry = remoteRuntime.players.get(msg.sessionId);
  if (!entry) return;
  entry.actions.push(msg);
  if (entry.actions.length > 16) entry.actions.shift();
  remoteRuntime.actionsReceived++;
}

function clearRemotes(): void {
  remoteRuntime.players.clear();
  clearBubbles();
}

// --- 回報本機位置 ---

/** 下一次位置跳動是伺服器要求的修正（不必再送 warp） */
let pendingCorrection = false;
let lastWarpSeq = 0;
let lastSent: (MoveMessage & { at: number }) | null = null;
let lastWeapon: string | null = null;
let lastClass: string | null = null;

function startSending(warpSeqAtJoin: number): void {
  stopSending();
  lastWarpSeq = warpSeqAtJoin;
  lastSent = null;
  lastWeapon = authority.getState().player.weapon;
  lastClass = authority.getState().player.heroClass;
  pendingCorrection = false;
  playerRuntime.netActions.length = 0;
  sendTimer = window.setInterval(sendTick, NET.sendMs);
}

function stopSending(): void {
  if (sendTimer !== null) window.clearInterval(sendTimer);
  sendTimer = null;
}

function sendTick(): void {
  // 重連中不送（SDK 會把訊息排隊，重連後一次送出一堆舊位置）
  if (!room || useNetStore.getState().status !== 'connected') return;
  sendActions();
  const move = localMove();
  const now = performance.now();
  if (forceWarp) {
    forceWarp = false;
    lastWarpSeq = playerRuntime.warpSeq;
    pendingCorrection = false;
    room.send(ClientMessage.warp, move);
    lastSent = { ...move, at: now };
    return;
  }
  if (playerRuntime.warpSeq !== lastWarpSeq) {
    lastWarpSeq = playerRuntime.warpSeq;
    // 伺服器要我們回去的位置，伺服器本來就知道，當一般移動送
    const type = pendingCorrection ? ClientMessage.move : ClientMessage.warp;
    pendingCorrection = false;
    room.send(type, move);
    lastSent = { ...move, at: now };
    return;
  }
  const moved =
    !lastSent ||
    Math.hypot(move.x - lastSent.x, move.y - lastSent.y, move.z - lastSent.z) > 0.01 ||
    Math.abs(move.yaw - lastSent.yaw) > 0.01 ||
    move.anim !== lastSent.anim;
  if (!moved && lastSent && now - lastSent.at < NET.idleResendMs) return;
  room.send(ClientMessage.move, move);
  lastSent = { ...move, at: now };
}

/** 攻擊、施法與換武器（任務 11E）：排在位置之前送，接收端依時間對齊 */
function sendActions(): void {
  if (!room) return;
  const { weapon, heroClass } = authority.getState().player;
  if (weapon !== lastWeapon || heroClass !== lastClass) {
    room.send(ClientMessage.equip, heroClass !== lastClass ? { weapon, heroClass } : { weapon });
    lastWeapon = weapon;
    lastClass = heroClass;
  }
  const actions = playerRuntime.netActions;
  for (const action of actions) room.send(ClientMessage.action, action);
  remoteRuntime.actionsSent += actions.length;
  actions.length = 0;
}

/** 伺服器不採用本機位置：把本機玩家拉回伺服器上的位置 */
function applyCorrection(msg: CorrectionMessage): void {
  remoteRuntime.corrections++;
  remoteRuntime.lastCorrection = msg;
  pendingCorrection = true;
  playerRuntime.teleportRequest = { x: msg.x, z: msg.z, feetY: msg.y - FOOT_OFFSET };
}

/**
 * 聊天輸入列送出（任務 11F）：/mute、/unmute 在本機處理；其他送給伺服器（清理、過濾、頻率由伺服器負責）。
 * 回傳 false 表示沒有送出（沒連線、空白），輸入列保留內容。
 */
export function submitChat(raw: string): boolean {
  const input = parseChatInput(raw, useChatStore.getState().channel);
  switch (input.type) {
    case 'empty':
      return false;
    case 'error':
      localNotice(input.key);
      return true;
    case 'mute':
      mute(input.name);
      return true;
    case 'unmute':
      unmute(input.name);
      return true;
    case 'send':
      if (!room || useNetStore.getState().status !== 'connected') return false;
      room.send(ClientMessage.chat, { channel: input.channel, text: input.text, ...(input.to ? { to: input.to } : {}) });
      return true;
  }
}

/** 除錯 / 測試：送任意訊息（驗證伺服器會拒絕不合法的內容） */
export function sendRaw(type: string, payload: unknown): boolean {
  if (!room) return false;
  room.send(type, payload);
  return true;
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err && 'code' in err) return String((err as { code: unknown }).code);
  return String(err);
}
