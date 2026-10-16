// 雲端存檔的同步判斷（任務 11G）：登入後比對本機與雲端的主存檔，決定要上傳、下載、還是問玩家。
// 純函式，不碰網路與儲存；兩份存檔以 savedAt 判斷是不是同一版。
export type SyncSide = { savedAt: string; playTime: number } | null;

export type SyncPlan =
  | { kind: 'none' }
  | { kind: 'upload' }
  | { kind: 'download' }
  | { kind: 'conflict'; local: NonNullable<SyncSide>; cloud: NonNullable<SyncSide> };

export function planSync(local: SyncSide, cloud: SyncSide): SyncPlan {
  if (!local && !cloud) return { kind: 'none' };
  if (local && !cloud) return { kind: 'upload' };
  if (!local && cloud) return { kind: 'download' };
  // 兩邊都有：同一版就不動；不同版時必須問玩家，不能自動覆蓋任何一邊
  if (local!.savedAt === cloud!.savedAt) return { kind: 'none' };
  return { kind: 'conflict', local: local!, cloud: cloud! };
}
