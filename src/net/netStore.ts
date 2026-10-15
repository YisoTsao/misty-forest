// 多人連線的狀態（任務 11A）：UI 用的 zustand store 只放「連線狀態、人數、有哪些人」，
// 只在改變時 set；遠端玩家每 50 ms 的位置放在可變的 remoteRuntime，由 RemotePlayers 每幀讀取，不觸發 React 重新渲染。
import { create } from 'zustand';
import { ClockSync, SnapshotBuffer, type Pose } from '@/game-core/net/interpolation';
import { NET, type RemotePlayerView } from '@/game-core/net/protocol';

export const netStatuses = ['offline', 'connecting', 'connected', 'error'] as const;
export type NetStatus = (typeof netStatuses)[number];

export type NetMember = { sessionId: string; name: string };

type NetState = {
  status: NetStatus;
  serverUrl: string;
  roomId: string | null;
  sessionId: string | null;
  playerId: string | null;
  /** 房間內的人數（含自己） */
  playerCount: number;
  /** 其他玩家（加入 / 離開 / 改名時才更新） */
  members: readonly NetMember[];
  /** 最後一次錯誤或斷線原因（i18n key 或伺服器訊息） */
  error: string | null;
};

export const initialNetState: NetState = {
  status: 'offline',
  serverUrl: '',
  roomId: null,
  sessionId: null,
  playerId: null,
  playerCount: 0,
  members: [],
  error: null,
};

export const useNetStore = create<NetState>(() => ({ ...initialNetState }));

/** 遠端玩家：最新狀態、插值快照（對方的時間軸）、對方與本機的時鐘差 */
export type RemoteEntry = { view: RemotePlayerView; buffer: SnapshotBuffer; clock: ClockSync };

export function createRemoteEntry(view: RemotePlayerView): RemoteEntry {
  return { view, buffer: new SnapshotBuffer(NET.sendMs), clock: new ClockSync() };
}

/** 本機此刻要畫的姿勢：對方時間軸上「現在 − 呈現延遲」那一刻 */
export function remotePose(entry: RemoteEntry, localNow: number): Pose | null {
  const remoteNow = entry.clock.toRemote(localNow);
  return remoteNow === null ? null : entry.buffer.sample(remoteNow - NET.interpDelayMs);
}

/** 遠端玩家的最新狀態與插值快照（sessionId → entry） */
export const remoteRuntime = {
  players: new Map<string, RemoteEntry>(),
  /** 伺服器拒絕本機位置的次數（除錯與測試觀察用） */
  corrections: 0,
  lastCorrection: null as { x: number; y: number; z: number; reason: string } | null,
};

export function isConnected(): boolean {
  return useNetStore.getState().status === 'connected';
}
