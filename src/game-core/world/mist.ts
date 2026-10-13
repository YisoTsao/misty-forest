// 迷霧（規格 1.4、4.5；裁決 R-03）：權威狀態為每區三段，渲染層以 0–1 的 mistLevel 插值。

export const mistStages = ['dense', 'light', 'clear'] as const;
export type MistStage = (typeof mistStages)[number];

const levels: Record<MistStage, number> = { dense: 1, light: 0.5, clear: 0 };

export function mistLevelOf(stage: MistStage): number {
  return levels[stage];
}

/** 限制在 0–1；非數值（例如網址參數打錯）回傳 null，讓呼叫端決定預設值。 */
export function parseMistLevel(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

/** 往目標平滑逼近（指數衰減，與幀率無關）。rate 越大越快。 */
export function approachMist(current: number, target: number, rate: number, dt: number): number {
  const next = target + (current - target) * Math.exp(-rate * dt);
  return Math.abs(next - target) < 1e-4 ? target : next;
}
