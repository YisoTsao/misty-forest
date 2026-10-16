// 登入後的存檔同步（任務 11G）：比對本機與雲端的主存檔，依 planSync 上傳、下載，或請玩家選擇。
// 只在標題畫面進行；遊戲中不會覆蓋正在進行的進度（DECISIONS T-178）。
import { MAIN_SLOT } from '@/game-core/save/schema';
import { planSync, type SyncPlan } from '@/game-core/save/sync';
import { loadMainSave } from '@/game/save/saveService';
import { saveStorage } from '@/game/save/storages';
import { currentScreen } from '@/game/state/gameStore';
import { sideOf, useAccountStore } from './accountStore';
import { fetchCloudSave, uploadCloudSave } from './cloudSave';

/** 比對並套用；回傳最後的計畫（衝突時會留在 store 等玩家選） */
export async function reconcileSave(): Promise<SyncPlan | null> {
  const { status } = useAccountStore.getState();
  if (status !== 'signedIn' || currentScreen() !== 'title') return null;
  try {
    const cloud = await fetchCloudSave();
    const localRaw = await saveStorage.read(MAIN_SLOT, 'primary').catch(() => null);
    const plan = planSync(sideOf(localRaw), cloud ? sideOf(cloud.data) : null);
    useAccountStore.setState({ synced: true, error: null });
    if (plan.kind === 'conflict') {
      useAccountStore.setState({ conflict: plan });
      return plan;
    }
    if (plan.kind === 'upload' && localRaw) await uploadCloudSave(localRaw, sideOf(localRaw)!.savedAt);
    if (plan.kind === 'download' && cloud) await applyCloud(cloud.data);
    return plan;
  } catch (err) {
    console.error('[account] 同步失敗：', err);
    useAccountStore.setState({ error: 'account.syncFailed', synced: false });
    return null;
  }
}

/** 玩家在衝突對話框選擇：用雲端的覆蓋本機，或用本機的覆蓋雲端 */
export async function resolveConflict(choice: 'cloud' | 'local'): Promise<void> {
  const conflict = useAccountStore.getState().conflict;
  if (!conflict) return;
  try {
    if (choice === 'cloud') {
      const cloud = await fetchCloudSave();
      if (cloud) await applyCloud(cloud.data);
    } else {
      const localRaw = await saveStorage.read(MAIN_SLOT, 'primary');
      if (localRaw) await uploadCloudSave(localRaw, sideOf(localRaw)!.savedAt);
    }
    useAccountStore.setState({ conflict: null, error: null });
  } catch (err) {
    console.error('[account] 解決衝突失敗：', err);
    useAccountStore.setState({ error: 'account.syncFailed' });
  }
}

/** 把雲端的存檔寫進本機主檔，並更新主選單的存檔資訊 */
async function applyCloud(data: unknown): Promise<void> {
  await saveStorage.write(MAIN_SLOT, data);
  await loadMainSave();
}
