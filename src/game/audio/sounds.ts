// 音效清單：名稱 → 檔案（多個變化隨機挑一個）與基本音量。檔案為 Kenney 的 CC0 音效包（docs/ASSETS.md）。
export type SoundId =
  | 'step_grass'
  | 'step_wood'
  | 'chop'
  | 'mine'
  | 'pick'
  | 'pickup'
  | 'chest'
  | 'quest_accept'
  | 'quest_complete'
  | 'reject'
  | 'ui_click'
  | 'ui_back'
  | 'build'
  | 'repair'
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'enemy_down'
  | 'skill'
  | 'dialogue'
  | 'companion';

const kenney = (names: string[]) => names.map((n) => `audio/kenney/${n}.ogg`);

export const sounds: Record<SoundId, { files: string[]; volume: number; rate?: [number, number] }> = {
  step_grass: { files: kenney(['footstep_grass_000', 'footstep_grass_001', 'footstep_grass_002', 'footstep_grass_003', 'footstep_grass_004']), volume: 0.35, rate: [0.9, 1.1] },
  step_wood: { files: kenney(['footstep_wood_000', 'footstep_wood_001', 'footstep_wood_002', 'footstep_wood_003', 'footstep_wood_004']), volume: 0.45, rate: [0.9, 1.1] },
  chop: { files: kenney(['chop']), volume: 0.7, rate: [0.92, 1.08] },
  mine: { files: kenney(['impactMining_000', 'impactMining_001', 'impactMining_002']), volume: 0.6 },
  pick: { files: kenney(['cloth1', 'cloth2', 'cloth3']), volume: 0.7 },
  pickup: { files: kenney(['handleSmallLeather']), volume: 0.45, rate: [1.0, 1.2] },
  chest: { files: kenney(['creak1']), volume: 0.7 },
  quest_accept: { files: kenney(['confirmation_001']), volume: 0.6 },
  quest_complete: { files: kenney(['confirmation_004']), volume: 0.7 },
  reject: { files: kenney(['error_004']), volume: 0.45 },
  ui_click: { files: kenney(['click_001']), volume: 0.4 },
  ui_back: { files: kenney(['back_001']), volume: 0.4 },
  build: { files: kenney(['impactPlank_medium_000', 'impactPlank_medium_001']), volume: 0.7 },
  repair: { files: kenney(['impactPlank_medium_002']), volume: 0.8 },
  swing: { files: kenney(['drawKnife1', 'drawKnife2', 'drawKnife3']), volume: 0.5, rate: [0.95, 1.1] },
  hit: { files: kenney(['impactPunch_medium_000', 'impactPunch_medium_001']), volume: 0.6 },
  hurt: { files: kenney(['impactSoft_heavy_000', 'impactSoft_heavy_001']), volume: 0.7 },
  enemy_down: { files: kenney(['impactSoft_medium_000']), volume: 0.6, rate: [0.7, 0.8] },
  skill: { files: kenney(['impactGlass_light_000', 'impactGlass_light_001']), volume: 0.6, rate: [1.2, 1.3] },
  dialogue: { files: kenney(['bookFlip1']), volume: 0.35 },
  companion: { files: kenney(['select_002']), volume: 0.4, rate: [1.3, 1.4] },
};
