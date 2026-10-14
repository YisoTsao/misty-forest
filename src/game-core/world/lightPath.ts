// 水鏡光路謎題（任務 9D，Bible §7.4 quest_lake_002「把水送回遠方」）。純函式。
// 光從光源射向第一面水鏡；每面水鏡把光往「鏡子目前朝向」的方向送出（placement 的 yaw + 轉動次數 × 90°，Bible：每座鏡片只可按 90 度旋轉）；
// 光線方向上 tolerance 度以內、maxLength 公尺以內最近的下一面鏡子或終點接住光，終點（湖底閘門）被照到時謎題完成。
// 光線一路都畫在場景上（Bible：關鍵光路需在環境中清楚顯示），沒有接住的光照到 maxLength 為止。
import { z } from 'zod';
import type { ObjectRuntime, Placement } from './types';

export const lightPathDefSchema = z.object({
  id: z.string().min(1),
  /** 光源（世界座標 x, z）與光的高度 */
  source: z.tuple([z.number(), z.number()]),
  sourceY: z.number(),
  /** 依光路順序排列的水鏡（placement id，prefab 有 turn，positions 為 4） */
  mirrors: z.array(z.string().min(1)).min(1),
  /** 終點（placement id，prefab 有 activate）：照到時啟動 */
  target: z.string().min(1),
  /** 光線方向與目標方位的容許夾角（度） */
  tolerance: z.number().positive().max(45),
  /** 鏡子送出的光最遠照到多遠（公尺） */
  maxLength: z.number().positive(),
});
export type LightPathDef = z.infer<typeof lightPathDefSchema>;

export function parseLightPaths(raw: unknown, placementIds: ReadonlySet<string>): LightPathDef[] {
  const list = z.array(lightPathDefSchema).parse(raw);
  const seen = new Set<string>();
  for (const l of list) {
    if (seen.has(l.id)) throw new Error(`光路 id 重複：${l.id}`);
    seen.add(l.id);
    for (const id of [...l.mirrors, l.target]) if (!placementIds.has(id)) throw new Error(`光路 ${l.id} 參照不存在的物件：${id}`);
  }
  return list;
}

type Objects = ReadonlyMap<string, Pick<ObjectRuntime, 'turn' | 'active'>>;
type Lookup = (id: string) => Placement | undefined;

export type LightSegment = { from: { x: number; z: number }; to: { x: number; z: number }; /** 接住這段光的物件（沒有接住時為 null） */ hit: string | null };

export type LightTrace = {
  segments: LightSegment[];
  /** 被光照到的水鏡（依光路順序） */
  lit: string[];
  /** 終點被照到 */
  solved: boolean;
};

/** 水鏡目前送出光的方向（yaw，0 = +Z） */
export function mirrorYaw(p: Placement, turn: number): number {
  return (p.rotation?.[1] ?? 0) + turn * (Math.PI / 2);
}

function bearing(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function angleDiff(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function traceLight(def: LightPathDef, placement: Lookup, objects: Objects): LightTrace {
  const nodes = [...def.mirrors, def.target].flatMap((id) => {
    const p = placement(id);
    return p ? [{ id, x: p.position[0], z: p.position[2], p }] : [];
  });
  const first = nodes.find((n) => n.id === def.mirrors[0]);
  const segments: LightSegment[] = [];
  const lit: string[] = [];
  if (!first) return { segments, lit, solved: false };
  // 光源固定照向第一面鏡子
  let at = { x: def.source[0], z: def.source[1] };
  let current = first;
  segments.push({ from: at, to: { x: first.x, z: first.z }, hit: first.id });
  const tol = (def.tolerance * Math.PI) / 180;
  for (let guard = 0; guard <= def.mirrors.length; guard++) {
    if (current.id === def.target) return { segments, lit, solved: true };
    lit.push(current.id);
    at = { x: current.x, z: current.z };
    const yaw = mirrorYaw(current.p, objects.get(current.id)?.turn ?? 0);
    let next: (typeof nodes)[number] | null = null;
    let best = Infinity;
    for (const n of nodes) {
      if (n.id === current.id || lit.includes(n.id)) continue;
      const d = Math.hypot(n.x - at.x, n.z - at.z);
      if (d > def.maxLength || d >= best) continue;
      if (angleDiff(bearing(at, n), yaw) <= tol) {
        next = n;
        best = d;
      }
    }
    if (!next) {
      segments.push({ from: at, to: { x: at.x + Math.sin(yaw) * Math.min(def.maxLength, 14), z: at.z + Math.cos(yaw) * Math.min(def.maxLength, 14) }, hit: null });
      return { segments, lit, solved: false };
    }
    segments.push({ from: at, to: { x: next.x, z: next.z }, hit: next.id });
    current = next;
  }
  return { segments, lit, solved: current.id === def.target };
}

/** 光照到、但還沒啟動的終點（規則據此送出啟動事件） */
export function targetsToLight(defs: readonly LightPathDef[], placement: Lookup, objects: Objects): string[] {
  return defs.filter((d) => objects.get(d.target)?.active !== true && traceLight(d, placement, objects).solved).map((d) => d.target);
}
