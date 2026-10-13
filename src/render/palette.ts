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
