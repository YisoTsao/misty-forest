// 地圖邊界（GAME_DESIGN 5.1、決策 G-05）：可玩區為以原點為中心的圓角方形。
// 純函式：邊界碰撞的擺放、迷霧牆、靠近提示與測試共用同一份定義。

export type PlayBounds = {
  /** 可玩區的半寬（m） */
  halfExtent: number;
  /** 四角的圓角半徑（m） */
  cornerRadius: number;
};

/** 晨曦谷地垂直切片的可玩區：±74 m（與安全點範圍一致：地形半寬 80 − 邊緣保留 6） */
export const PLAY_BOUNDS: PlayBounds = { halfExtent: 74, cornerRadius: 10 };

/** 迷霧牆從距邊界這麼遠開始變濃 */
export const BOUNDARY_FOG_START = 12;
/** 距邊界小於此值時顯示「迷霧太濃」提示 */
export const BOUNDARY_WARN_DISTANCE = 4;

/**
 * 到邊界的有號水平距離：界內為正（離邊界多遠），界外為負。
 * 圓角方形的 SDF 取負號。
 */
export function boundaryDistance(x: number, z: number, b: PlayBounds = PLAY_BOUNDS): number {
  const inner = b.halfExtent - b.cornerRadius;
  const qx = Math.abs(x) - inner;
  const qz = Math.abs(z) - inner;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, qz), 0);
  return -(outside + inside - b.cornerRadius);
}

/** 把位置拉回界內，且與邊界至少保持 margin（m）。已在界內足夠深處時原樣回傳。 */
export function clampInsideBounds(x: number, z: number, margin = 0, b: PlayBounds = PLAY_BOUNDS): { x: number; z: number } {
  if (boundaryDistance(x, z, b) >= margin) return { x, z };
  // 縮小後的圓角方形（半寬與圓角同減 margin），投影到它的邊上
  const half = b.halfExtent - margin;
  const radius = Math.max(b.cornerRadius - margin, 0);
  const inner = half - radius;
  const sx = Math.sign(x) || 1;
  const sz = Math.sign(z) || 1;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax > inner && az > inner) {
    // 角落：投影到圓角弧上
    const dx = ax - inner;
    const dz = az - inner;
    const len = Math.hypot(dx, dz) || 1;
    return { x: sx * (inner + (dx / len) * radius), z: sz * (inner + (dz / len) * radius) };
  }
  return { x: sx * Math.min(ax, half), z: sz * Math.min(az, half) };
}

/** 迷霧牆濃度 0–1：距邊界 BOUNDARY_FOG_START 以外為 0，貼著邊界為 1。 */
export function boundaryFogFactor(distance: number): number {
  const t = Math.min(1, Math.max(0, 1 - distance / BOUNDARY_FOG_START));
  return t * t * (3 - 2 * t);
}

/**
 * 沿邊界一圈的取樣點（逆時針、首尾不重複），供碰撞與迷霧牆建網格使用。
 * 直邊每 segment 公尺一點，每個圓角 cornerSteps 段。offset 為往外推的距離。
 */
export function boundaryOutline(
  segment: number,
  cornerSteps: number,
  offset = 0,
  b: PlayBounds = PLAY_BOUNDS,
): { x: number; z: number }[] {
  const inner = b.halfExtent - b.cornerRadius;
  const r = b.cornerRadius + offset;
  const points: { x: number; z: number }[] = [];
  const corners = [
    { cx: inner, cz: inner, from: 0 },
    { cx: -inner, cz: inner, from: Math.PI / 2 },
    { cx: -inner, cz: -inner, from: Math.PI },
    { cx: inner, cz: -inner, from: (Math.PI * 3) / 2 },
  ];
  const edgeSteps = Math.max(1, Math.round((inner * 2) / segment));
  for (let c = 0; c < 4; c++) {
    const { cx, cz, from } = corners[c]!;
    for (let i = 0; i < cornerSteps; i++) {
      const a = from + (i / cornerSteps) * (Math.PI / 2);
      points.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
    }
    // 圓角結束點 → 下一個角的起點之間的直邊
    const end = from + Math.PI / 2;
    const sx = cx + Math.cos(end) * r;
    const sz = cz + Math.sin(end) * r;
    const next = corners[(c + 1) % 4]!;
    const ex = next.cx + Math.cos(next.from) * r;
    const ez = next.cz + Math.sin(next.from) * r;
    for (let i = 0; i < edgeSteps; i++) {
      const t = i / edgeSteps;
      points.push({ x: sx + (ex - sx) * t, z: sz + (ez - sz) * t });
    }
  }
  return points;
}
