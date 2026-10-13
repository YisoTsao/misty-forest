import { create } from 'zustand';
import { isQualityLevel, qualityPresets, type QualityLevel, type QualityPreset } from '@/game-core/settings/quality';
import { loadWithFallback } from '@/game-core/save/load';
import { SETTINGS_SLOT } from '@/game-core/save/schema';
import { parseSettings, SETTINGS_VERSION, type SettingsData } from '@/game-core/settings/settingsData';
import { saveStorage } from '../save/storages';

// 玩家設定（規格 6.9）。變更後寫入設定存檔，下次啟動讀回。
type SettingsState = {
  quality: QualityLevel;
  setQuality: (quality: QualityLevel) => void;
};

/** ?quality=low|medium|high 可指定初始畫質（量測與截圖用），此時不讀取已存的設定 */
const urlQuality = new URLSearchParams(window.location.search).get('quality');

function persist(state: SettingsState): void {
  const data: SettingsData = { version: SETTINGS_VERSION, quality: state.quality };
  saveStorage.write(SETTINGS_SLOT, data).catch((err: unknown) => console.error('[settings] 設定存檔失敗：', err));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  quality: isQualityLevel(urlQuality) ? urlQuality : 'high',
  setQuality: (quality) => {
    set({ quality });
    persist(get());
  },
}));

/** 啟動時讀取已存的設定；讀不到或格式不符時沿用預設值 */
export async function loadSettings(): Promise<void> {
  if (isQualityLevel(urlQuality)) return;
  const outcome = await loadWithFallback(saveStorage, SETTINGS_SLOT, (raw) => {
    const settings = parseSettings(raw);
    if (!settings) throw new Error('設定格式不符');
    return settings;
  });
  if (outcome.status === 'ok' || outcome.status === 'restored-from-backup') useSettingsStore.setState({ quality: outcome.value.quality });
  else if (outcome.status === 'corrupt') console.warn('[settings] 設定檔無法讀取，使用預設值：', outcome.primaryError);
}

export function useQualityPreset(): QualityPreset {
  return qualityPresets[useSettingsStore((s) => s.quality)];
}
