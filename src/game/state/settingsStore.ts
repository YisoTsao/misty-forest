import { create } from 'zustand';
import keybindings from '@/data/keybindings.json';
import { parseBindings, parseSavedBindings, rebind, type ActionId, type Bindings, type RebindResult } from '@/game-core/input/actions';
import { loadWithFallback } from '@/game-core/save/load';
import { SETTINGS_SLOT } from '@/game-core/save/schema';
import { isQualityLevel, qualityPresets, type QualityLevel, type QualityPreset } from '@/game-core/settings/quality';
import { parseSettings, SETTINGS_VERSION, type SettingsData } from '@/game-core/settings/settingsData';
import { useInputDeviceStore } from '../input/device';
import { input } from '../input/inputManager';
import { saveStorage } from '../save/storages';

// 玩家設定（規格 6.9）：畫質與按鍵。變更後寫入設定存檔，下次啟動讀回。

export const defaultBindings: Bindings = parseBindings(keybindings);

export type Volumes = { master: number; music: number; sfx: number };
export const defaultVolumes: Volumes = { master: 0.8, music: 0.5, sfx: 0.8 };

type SettingsState = {
  quality: QualityLevel;
  bindings: Bindings;
  volumes: Volumes;
  setVolume: (channel: keyof Volumes, value: number) => void;
  setQuality: (quality: QualityLevel) => void;
  /** 重新配置一個按鍵；結果（含錯誤）回傳給設定畫面顯示 */
  setBinding: (action: ActionId, slot: 0 | 1, code: string | null) => RebindResult;
  resetBindings: () => void;
};

/** ?quality=low|medium|high 可指定初始畫質（量測與截圖用），此時不讀取已存的設定 */
const urlQuality = new URLSearchParams(window.location.search).get('quality');

function persist(state: SettingsState): void {
  const data: SettingsData = { version: SETTINGS_VERSION, quality: state.quality, bindings: state.bindings, volumes: state.volumes };
  saveStorage.write(SETTINGS_SLOT, data).catch((err: unknown) => console.error('[settings] 設定存檔失敗：', err));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  quality: isQualityLevel(urlQuality) ? urlQuality : 'high',
  bindings: defaultBindings,
  volumes: defaultVolumes,
  setVolume: (channel, value) => {
    set({ volumes: { ...get().volumes, [channel]: Math.min(1, Math.max(0, value)) } });
    persist(get());
  },
  setQuality: (quality) => {
    set({ quality });
    persist(get());
  },
  setBinding: (action, slot, code) => {
    const result = rebind(get().bindings, action, slot, code);
    if ('bindings' in result) {
      set({ bindings: result.bindings });
      input.setBindings(result.bindings);
      persist(get());
    }
    return result;
  },
  resetBindings: () => {
    set({ bindings: defaultBindings });
    input.setBindings(defaultBindings);
    persist(get());
  },
}));

/** 啟動時讀取已存的設定；讀不到或格式不符時沿用預設值 */
export async function loadSettings(): Promise<void> {
  const outcome = await loadWithFallback(saveStorage, SETTINGS_SLOT, (raw) => {
    const settings = parseSettings(raw);
    if (!settings) throw new Error('設定格式不符');
    return settings;
  });
  if (outcome.status === 'ok' || outcome.status === 'restored-from-backup') {
    const { quality, bindings, volumes } = outcome.value;
    if (!isQualityLevel(urlQuality)) useSettingsStore.setState({ quality });
    if (volumes) useSettingsStore.setState({ volumes });
    const merged = bindings ? parseSavedBindings(bindings, defaultBindings) : null;
    if (merged) {
      useSettingsStore.setState({ bindings: merged });
      input.setBindings(merged);
    }
  } else if (outcome.status === 'corrupt') {
    console.warn('[settings] 設定檔無法讀取，使用預設值：', outcome.primaryError);
  }
}

export function useQualityPreset(): QualityPreset {
  return qualityPresets[useSettingsStore((s) => s.quality)];
}

/** 目前按鍵設定下的提示文字變數（例如 {interact} → E） */
export function useBindings(): Bindings {
  // 提示文字依最近使用的裝置顯示鍵盤按鍵或手把按鈕（actionKey）：切換裝置時重新繪製
  useInputDeviceStore((s) => s.device);
  return useSettingsStore((s) => s.bindings);
}
