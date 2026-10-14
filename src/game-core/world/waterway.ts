// 水道謎題（任務 8C，Bible §6.4 quest_forest_002「把水還給森林」）。純函式。
// 水從泉眼沿渠道往下流，依序經過幾個阻擋點（堵住的樹根、兩座閘門、崩塌的渠段）：
// 阻擋點全部排除後水才流到水輪；水輪轉到哪個位置，水就沿那一道木槽流到對應的苔蘚節點，節點被喚醒後保持喚醒。
import { z } from 'zod';
import type { ObjectRuntime } from './types';

export const waterwayDefSchema = z.object({
  id: z.string().min(1),
  /** 由上游往下游排列的阻擋點（placement id）：啟動（樹根移開、閘門打開）或修好後才讓水通過 */
  blockers: z.array(z.string().min(1)).min(1),
  /** 分水的水輪（placement id，prefab 有 turn） */
  wheel: z.string().min(1),
  /** 水輪每個位置對應的苔蘚節點（placement id，prefab 有 activate）；數量等於水輪的位置數 */
  outlets: z.array(z.string().min(1)).min(1),
});
export type WaterwayDef = z.infer<typeof waterwayDefSchema>;

export function parseWaterways(raw: unknown, placementIds: ReadonlySet<string>): WaterwayDef[] {
  const list = z.array(waterwayDefSchema).parse(raw);
  const seen = new Set<string>();
  for (const w of list) {
    if (seen.has(w.id)) throw new Error(`水道 id 重複：${w.id}`);
    seen.add(w.id);
    for (const id of [...w.blockers, w.wheel, ...w.outlets]) {
      if (!placementIds.has(id)) throw new Error(`水道 ${w.id} 參照不存在的物件：${id}`);
    }
  }
  return list;
}

type Objects = ReadonlyMap<string, Pick<ObjectRuntime, 'active' | 'repaired' | 'turn'>>;

export type WaterwayFlow = {
  /** 由上游數來已排除的阻擋點數；水流到第一個還沒排除的阻擋點為止 */
  cleared: number;
  /** 水流到了水輪（全部阻擋點都已排除） */
  flowing: boolean;
  /** 水輪目前的位置 */
  turn: number;
  /** 水正流向的苔蘚節點；沒有水流時為 null */
  outlet: string | null;
};

export function isBlockerCleared(objects: Objects, id: string): boolean {
  const rt = objects.get(id);
  return rt?.active === true || rt?.repaired === true;
}

export function waterwayFlow(def: WaterwayDef, objects: Objects): WaterwayFlow {
  let cleared = 0;
  while (cleared < def.blockers.length && isBlockerCleared(objects, def.blockers[cleared]!)) cleared++;
  const flowing = cleared === def.blockers.length;
  const turn = (objects.get(def.wheel)?.turn ?? 0) % def.outlets.length;
  return { cleared, flowing, turn, outlet: flowing ? def.outlets[turn]! : null };
}

/** 水正流到、但還沒被喚醒的苔蘚節點（規則據此送出啟動事件） */
export function outletsToWake(defs: readonly WaterwayDef[], objects: Objects): string[] {
  const out: string[] = [];
  for (const def of defs) {
    const { outlet } = waterwayFlow(def, objects);
    if (outlet && objects.get(outlet)?.active !== true) out.push(outlet);
  }
  return out;
}
