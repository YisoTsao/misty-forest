// 特效請求佇列（GAME_DESIGN 5.4 VFX 引擎）：遊戲邏輯（施法、命中、擊敗）只描述「要什麼特效、在哪裡」，
// 不碰 three.js；VfxSystem（R3F）每幀取出請求，用預先配置的粒子池與物件池播放。

export type Rgb = readonly [number, number, number];

export type VfxRequest =
  /** 腳下的魔法陣：展開 → 停留 → 淡出；follow 為 true 時跟著玩家移動 */
  | { type: 'magicCircle'; x: number; y: number; z: number; radius: number; duration: number; color: Rgb; follow?: boolean }
  /** 由中心往外擴散的光環 */
  | { type: 'shockwave'; x: number; y: number; z: number; radius: number; duration: number; color: Rgb }
  /** 粒子爆發（預設的樣式） */
  | { type: 'burst'; preset: BurstPreset; x: number; y: number; z: number; color: Rgb; scale?: number }
  /** 短暫點亮周圍的點光源（最多同時 2 盞） */
  | { type: 'flash'; x: number; y: number; z: number; color: Rgb; intensity: number; duration: number; distance?: number };

export type BurstPreset =
  /** 星光衝擊：星點螺旋上升 + 地面火花 */
  | 'nova'
  /** 蓄力：光點往中心聚集 */
  | 'gather'
  /** 星屑飛彈命中：小型星花 */
  | 'boltHit'
  /** 迷霧生物被魔法淨化：霧散成上升的金色光點 */
  | 'purify'
  /** 流星落地（任務 6E） */
  | 'meteorHit';

export const vfxQueue: VfxRequest[] = [];

export function vfx(request: VfxRequest): void {
  vfxQueue.push(request);
  // 避免在畫面暫停或特效系統未掛載時無限累積
  if (vfxQueue.length > 64) vfxQueue.shift();
}

/** 飛行中的彈體（星屑飛彈、流星）：由法術系統模擬位置，VfxSystem 只負責畫出核心光點與拖尾 */
export type ProjectileVisual = { id: number; x: number; y: number; z: number; color: Rgb; size: number; trail: number };

export const projectileVisuals = new Map<number, ProjectileVisual>();

/** 除錯與測試：粒子系統狀態（VfxSystem 寫入） */
export const vfxStats = { capacity: 0, emitted: 0, alive: 0, circles: 0, shockwaves: 0, lights: 0 };
