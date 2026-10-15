// 多人連線的客戶端 adapter（任務 11A / 11B）：Web 與 Electron 共用。
// 連線 / 中斷 / 重新連線、把房間狀態整理成遠端玩家清單、每 50 ms 回報本機位置、套用伺服器的位置修正。
// 只有這個檔案 import Colyseus SDK；其他模組透過 netStore 與這裡的函式使用。
import { Client, type Room } from '@colyseus/sdk';
import {
  ClientMessage,
  isNetAnim,
  NET,
  PROTOCOL_VERSION,
  ROOM_NAME,
  sanitizeName,
  ServerMessage,
  type CorrectionMessage,
  type MoveMessage,
  type NetAnim,
  type RemotePlayerView,
} from '@/game-core/net/protocol';
import { getCharacterDef, PLAYER_CHARACTER_ID } from '@/game/character/characters';
import { t } from '@/game/i18n';
import { playerRuntime } from '@/game/player/localRuntime';
import { useUiStore } from '@/game/state/uiStore';
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
let lastOptions: { name?: string } = {};
let firstState = true;

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
  const status = useNetStore.getState().status;
  if (room || status === 'connecting') return status === 'connected';
  lastOptions = { name: options.name ?? lastOptions.name };
  const url = options.url ?? serverUrl();
  const name = connectionName();
  rememberName(name);
  useNetStore.setState({ ...initialNetState, status: 'connecting', serverUrl: url });
  // 加入期間若發生讀檔 / 新遊戲的位置跳動，連上後要補送 warp：以送出加入時的計數為準
  const warpSeqAtJoin = playerRuntime.warpSeq;
  try {
    const client = new Client(url);
    const joined = await client.joinOrCreate(ROOM_NAME, { protocol: PROTOCOL_VERSION, name, at: localMove() });
    // 第一階段不做斷線續玩（伺服器沒有保留座位），斷線就回到離線、由玩家按「重新連線」重新加入
    joined.reconnection.enabled = false;
    room = joined;
  } catch (err) {
    useNetStore.setState({ status: 'error', error: `${t('net.connectFailed')}：${errorText(err)}` });
    return false;
  }
  const joined = room;
  firstState = true;
  useNetStore.setState({ status: 'connected', roomId: joined.roomId, sessionId: joined.sessionId, error: null });
  joined.onStateChange((state: WorldStateLike) => syncState(state));
  joined.onMessage(ServerMessage.correction, (msg: CorrectionMessage) => applyCorrection(msg));
  joined.onError((code, message) => console.warn(`[net] 房間錯誤 ${code}：${message ?? ''}`));
  joined.onLeave((code, reason) => onLeft(code, reason));
  startSending(warpSeqAtJoin);
  return true;
}

/** 自己中斷連線（回到主選單、在面板按「中斷」） */
export async function disconnect(): Promise<void> {
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

/** 斷線後重新加入（第一階段：重新連線 = 以同樣的名字重新加入，不保留伺服器上的 session） */
export async function reconnect(options: { name?: string } = lastOptions): Promise<boolean> {
  await disconnect();
  return connect(options);
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
  console.warn(`[net] 與伺服器的連線中斷（${code}${reason ? `：${reason}` : ''}）`);
  useNetStore.setState({ ...initialNetState, status: 'error', serverUrl: useNetStore.getState().serverUrl, error: t('net.disconnected') });
  useUiStore.getState().pushToast({ textKey: 'net.disconnected' });
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
    };
    let entry = remoteRuntime.players.get(sessionId);
    const fresh = !entry || entry.view.t !== view.t;
    if (entry) entry.view = view;
    else remoteRuntime.players.set(sessionId, (entry = createRemoteEntry(view)));
    // 只有對方送出新位置時才記錄：快照的時間是對方送出的時間，插值不受伺服器更新間隔與網路抖動影響
    if (fresh) {
      entry.clock.update(now, view.t);
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
  const members: NetMember[] = [...remoteRuntime.players.values()].map((e) => ({ sessionId: e.view.sessionId, name: e.view.name }));
  const before = new Map(store.members.map((m) => [m.sessionId, m.name]));
  const changed = members.length !== before.size || members.some((m) => before.get(m.sessionId) !== m.name);
  if (!changed && store.playerCount === count) return;
  // 加入 / 離開的通知（剛連上時的既有玩家不通知）
  if (notify) {
    const after = new Set(members.map((m) => m.sessionId));
    for (const m of members) if (!before.has(m.sessionId)) useUiStore.getState().pushToast({ textKey: 'net.joined', vars: { name: m.name } });
    for (const m of store.members) if (!after.has(m.sessionId)) useUiStore.getState().pushToast({ textKey: 'net.left', vars: { name: m.name } });
  }
  useNetStore.setState({ members, playerCount: count });
}

function clearRemotes(): void {
  remoteRuntime.players.clear();
}

// --- 回報本機位置 ---

/** 下一次位置跳動是伺服器要求的修正（不必再送 warp） */
let pendingCorrection = false;
let lastWarpSeq = 0;
let lastSent: (MoveMessage & { at: number }) | null = null;

function startSending(warpSeqAtJoin: number): void {
  stopSending();
  lastWarpSeq = warpSeqAtJoin;
  lastSent = null;
  pendingCorrection = false;
  sendTimer = window.setInterval(sendTick, NET.sendMs);
}

function stopSending(): void {
  if (sendTimer !== null) window.clearInterval(sendTimer);
  sendTimer = null;
}

function sendTick(): void {
  if (!room) return;
  const move = localMove();
  const now = performance.now();
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

/** 伺服器不採用本機位置：把本機玩家拉回伺服器上的位置 */
function applyCorrection(msg: CorrectionMessage): void {
  remoteRuntime.corrections++;
  remoteRuntime.lastCorrection = msg;
  pendingCorrection = true;
  playerRuntime.teleportRequest = { x: msg.x, z: msg.z, feetY: msg.y - FOOT_OFFSET };
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
