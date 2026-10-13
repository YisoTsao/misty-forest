import { create } from 'zustand';
import { isQualityLevel, qualityPresets, type QualityLevel, type QualityPreset } from '@/game-core/settings/quality';

// 玩家設定（規格 6.9）。Phase 1 只有畫質；設定值的存檔於 Phase 2 與存檔系統一起實作。
type SettingsState = {
  quality: QualityLevel;
  setQuality: (quality: QualityLevel) => void;
};

/** ?quality=low|medium|high 可指定初始畫質（量測與截圖用） */
function initialQuality(): QualityLevel {
  const fromUrl = new URLSearchParams(window.location.search).get('quality');
  return isQualityLevel(fromUrl) ? fromUrl : 'high';
}

export const useSettingsStore = create<SettingsState>((set) => ({
  quality: initialQuality(),
  setQuality: (quality) => set({ quality }),
}));

export function useQualityPreset(): QualityPreset {
  return qualityPresets[useSettingsStore((s) => s.quality)];
}
