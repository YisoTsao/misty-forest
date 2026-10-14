// 晴朗外觀色票（規格 4.2：暖色主光、偏藍環境光、高飽和）。
// Phase 1 的迷霧外觀會以 uMist 在此色票與迷霧色票之間插值。
export const palette = {
  skyZenith: '#5fb4ee',
  skyHorizon: '#cdeefc',
  sun: '#fff1d6',
  hemiSky: '#bfe3ff',
  hemiGround: '#6f9a4c',
  grassLight: '#8fd15a',
  grassDark: '#4f9a3a',
  grassSun: '#c5df62',
  dirt: '#c8a06a',
  dirtDark: '#a77e4e',
  rock: '#9c9a8c',
  sand: '#e6d29a',
  lakeBed: '#6f8f78',
  waterDeep: '#2f8fb8',
  waterShallow: '#69d3e0',
  waterFoam: '#f4fbff',
} as const;

export const fogRange = { near: 45, far: 230 } as const;

/**
 * Kenney Nature Kit（任務 7A）的材質色偏淡、偏青，與 KayKit 的飽和暖色不搭。
 * 依材質名稱換成本專案的色票（只影響 kenney-nature 的模型）。
 */
const KENNEY_NATURE_COLORS: Readonly<Record<string, string>> = {
  grass: '#5fae45',
  leafsGreen: '#58ad3c',
  leafsDark: '#3b8a48',
  leafsFall: '#e8963a',
  dirt: '#a98a6a',
  dirtDark: '#7e5e40',
  stone: '#b8b4a8',
  stoneDark: '#8e8a82',
  wood: '#b27a48',
  woodDark: '#7c5232',
  woodBark: '#8a5c3a',
  woodBarkDark: '#694430',
  woodInner: '#e8cc98',
  woodBirch: '#ece6d8',
  corn: '#f2c84a',
  colorRed: '#e0564a',
  colorRedDark: '#c0453e',
  colorPurple: '#a07ee6',
  colorYellow: '#f6c93e',
  colorTan: '#d8b286',
};

/** 依模型來源與材質名稱調整底色（就地修改 color）；不需要調整時不動 */
export function recolorForPalette(model: string, materialName: string, color: { set: (hex: string) => unknown }): void {
  if (!model.includes('kenney-nature/')) return;
  const hex = KENNEY_NATURE_COLORS[materialName];
  if (hex) color.set(hex);
}
