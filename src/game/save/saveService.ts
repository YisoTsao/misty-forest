import { fromSaveData, toSaveData, type LoadedSave, type PlayerSnapshot } from '@/game-core/save/convert';
import { loadWithFallback, type LoadOutcome } from '@/game-core/save/load';
import { MAIN_SLOT } from '@/game-core/save/schema';
import { authority, buildables, combat, worldIndex } from '../authority';
import { playerRuntime } from '../player/localRuntime';
import { savePosition } from '../location';
import { useSaveStore, type MainSaveInfo } from '../state/saveStore';
import { worldDataResult } from '../worldData';
import { saveStorage } from './storages';
import { isOnline, writeOnlineSave } from '@/online/onlineStore';

// 存檔服務（規格 6.8）：讀檔（主檔 → 備份）、寫檔（依序排隊、非阻塞）、匯出。
// 單機的一局寫本機存檔；線上的一局只寫資料庫的線上角色（任務 11L-2，DECISIONS T-179），兩者不同步。

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();

function snapshotPlayer(): PlayerSnapshot {
  const { position, locomotion } = playerRuntime;
  // 在室內存檔時記錄門口的位置（子場景不存檔）
  return savePosition() ?? { position: { ...position }, facingYaw: locomotion.facingYaw };
}

/** 把存檔 JSON（線上角色的 save 欄位）轉成可以開始遊戲的狀態；格式錯誤時拋出錯誤 */
export function loadedFromSaveData(raw: unknown): LoadedSave {
  const loaded = fromSaveData(raw, { world: worldIndex, items, combat, buildables });
  for (const w of loaded.warnings) console.warn(`[save] ${w}`);
  return loaded;
}

/** 讀取主存檔（主檔失敗時改用備份），並更新主選單顯示的存檔狀態。 */
export async function loadMainSave(): Promise<LoadOutcome<LoadedSave>> {
  const outcome = await loadWithFallback(saveStorage, MAIN_SLOT, (raw) => fromSaveData(raw, { world: worldIndex, items, combat, buildables }));
  const set = (mainSave: MainSaveInfo) => useSaveStore.setState({ mainSave });
  switch (outcome.status) {
    case 'ok':
    case 'restored-from-backup':
      for (const w of outcome.value.warnings) console.warn(`[save] ${w}`);
      set({ status: outcome.status, savedAt: outcome.value.savedAt, playTime: outcome.value.state.time });
      break;
    case 'missing':
      set({ status: 'missing' });
      break;
    case 'corrupt':
      console.error(`[save] 存檔無法讀取：主檔（${outcome.primaryError}）、備份（${outcome.backupError}）`);
      set({ status: 'corrupt', error: outcome.primaryError });
      break;
  }
  return outcome;
}

let writeChain: Promise<unknown> = Promise.resolve();

/** 存檔：以目前的權威狀態與玩家位置產生存檔並寫入。多次呼叫依序執行，回傳是否成功（失敗不拋錯，記錄在 store）。 */
export function saveGame(): Promise<boolean> {
  const data = toSaveData(authority.getState(), snapshotPlayer(), new Date());
  // 在呼叫當下決定寫到哪裡：回到標題時排在後面的存檔仍寫到這一局的位置
  const online = isOnline();
  const run = async (): Promise<boolean> => {
    useSaveStore.setState({ saving: true });
    try {
      if (online) {
        await writeOnlineSave(data);
        // 線上角色不影響主選單的本機存檔資訊
        useSaveStore.setState({ saving: false, lastSavedAt: data.savedAt, saveError: null });
        return true;
      }
      await saveStorage.write(MAIN_SLOT, data);
      useSaveStore.setState({
        saving: false,
        lastSavedAt: data.savedAt,
        saveError: null,
        mainSave: { status: 'ok', savedAt: data.savedAt, playTime: data.world.time },
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[save] 存檔失敗：', err);
      useSaveStore.setState({ saving: false, saveError: message });
      return false;
    }
  };
  const result = writeChain.then(run);
  writeChain = result;
  return result;
}

/** 匯出主存檔為 JSON 檔（Electron 會跳出另存新檔視窗）。 */
export async function exportMainSave(): Promise<void> {
  const blob = await saveStorage.export(MAIN_SLOT);
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `mistwood-save-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
