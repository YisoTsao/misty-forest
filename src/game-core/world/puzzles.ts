// 轉動機關的謜題（第二章 Phase 2，規格 P-02「倒流溪谷水輪」）。
// 一組機關（turn 物件）全部轉到指定位置時，啟動 opens 裡的物件（例如擋住溪谷的石障退開）。
// 謎題與答案都是資料（puzzles.json）；答案由環境線索（石碑）推導，不寫在場景裡。
import { z } from 'zod';

export const puzzleSchema = z.object({
  id: z.string().min(1),
  members: z.array(z.object({ placement: z.string().min(1), turn: z.number().int().nonnegative() })).min(1),
  opens: z.array(z.string().min(1)).min(1),
});
export type PuzzleDef = z.infer<typeof puzzleSchema>;

export function parsePuzzles(raw: unknown, placements: ReadonlySet<string>): readonly PuzzleDef[] {
  const list = z.array(puzzleSchema).parse(raw);
  for (const p of list) {
    for (const m of p.members) if (!placements.has(m.placement)) throw new Error(`謎題 ${p.id} 參照不存在的機關：${m.placement}`);
    for (const o of p.opens) if (!placements.has(o)) throw new Error(`謎題 ${p.id} 參照不存在的物件：${o}`);
  }
  return list;
}

/** 所有成員都轉到答案的位置 */
export function puzzleSolved(puzzle: PuzzleDef, turnOf: (placementId: string) => number): boolean {
  return puzzle.members.every((m) => turnOf(m.placement) === m.turn);
}
