// 互動目標選擇（規格 6.2：靠近 → 提示 → E）。
// 輸入為空間查詢得到的附近候選，選出最合適的一個：距離近、且在角色面前者優先。

export type InteractCandidate = {
  id: string;
  x: number;
  z: number;
  /** 可互動距離（水平） */
  radius: number;
};

/** 背對目標時的距離懲罰（公尺）。面向正前方為 0，正後方為此值。 */
const FACING_PENALTY = 1.2;

/**
 * facingYaw 與 locomotion 相同：0 表示面向 +Z。
 * 回傳最合適的候選 id；沒有在範圍內的候選時回傳 null。
 */
export function selectInteractTarget(
  player: { x: number; z: number; facingYaw: number },
  candidates: readonly InteractCandidate[],
): string | null {
  const fx = Math.sin(player.facingYaw);
  const fz = Math.cos(player.facingYaw);
  let bestId: string | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const dx = c.x - player.x;
    const dz = c.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > c.radius) continue;
    // 夾角餘弦：1 = 正前方，-1 = 正後方；距離極近時不計方向
    const cos = dist < 1e-3 ? 1 : (dx * fx + dz * fz) / dist;
    const score = dist + ((1 - cos) / 2) * FACING_PENALTY;
    if (score < bestScore) {
      bestScore = score;
      bestId = c.id;
    }
  }
  return bestId;
}
