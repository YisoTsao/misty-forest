// 可進入建築的室內（規格 5.1：室內與洞穴使用子場景＋傳送點，不與開放世界混用）。
import { z } from 'zod';

const point = z.tuple([z.number(), z.number()]);

export const interiorSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  /** 室內子場景的原點（遠離開放世界） */
  origin: point,
  /** 開放世界中的入口（建築 placement） */
  door: z.string().min(1),
  /** 進入後的位置與面向 [x, z, yaw] */
  inside: z.tuple([z.number(), z.number(), z.number()]),
  /** 離開時站在門口前方多遠 */
  outsideDistance: z.number().positive(),
  /** 室內暖光的位置 [x, y, z]（壁爐） */
  light: z.tuple([z.number(), z.number(), z.number()]),
});
export type InteriorDef = z.infer<typeof interiorSchema>;

export const OVERWORLD = 'overworld';

export function parseInteriors(raw: unknown, placementIds: ReadonlySet<string>): Map<string, InteriorDef> {
  const map = new Map<string, InteriorDef>();
  for (const i of z.array(interiorSchema).parse(raw)) {
    if (i.id === OVERWORLD) throw new Error('室內 id 不能是 overworld');
    if (map.has(i.id)) throw new Error(`室內 id 重複：${i.id}`);
    if (!placementIds.has(i.door)) throw new Error(`室內 ${i.id} 的入口不存在：${i.door}`);
    map.set(i.id, i);
  }
  return map;
}

/** 室內子場景的範圍（判斷玩家是否在某個室內）：原點 30 m 內 */
export function interiorAt(interiors: ReadonlyMap<string, InteriorDef>, x: number, z: number): InteriorDef | null {
  for (const i of interiors.values()) if (Math.hypot(x - i.origin[0], z - i.origin[1]) < 30) return i;
  return null;
}
