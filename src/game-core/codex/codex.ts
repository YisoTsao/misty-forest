// 圖鑑（第二章規格 §11.3、Bible §30.1）：怪物第一次交手後解鎖介紹、素材第一次取得後解鎖來源提示、讀古代石碑解鎖世界觀記錄。
// 條目是資料（codex.json）；解鎖由權威層依指令產生的事件判斷（handleCommand 收尾時附上 CodexUnlocked），存進權威狀態與存檔。
import { z } from 'zod';

export const codexCategories = ['creature', 'material', 'lore'] as const;
export type CodexCategory = (typeof codexCategories)[number];

const unlockSchema = z.discriminatedUnion('type', [
  /** 交手：玩家打到牠、被牠打到、或頭目戰開始 */
  z.object({ type: z.literal('encounter'), enemy: z.string().min(1) }),
  /** 第一次取得這個物品 */
  z.object({ type: z.literal('item'), item: z.string().min(1) }),
  /** 讀了這個告示牌 / 石碑 */
  z.object({ type: z.literal('read'), placement: z.string().min(1) }),
  /** 啟動了這個物件（古樹核心的記憶） */
  z.object({ type: z.literal('activate'), placement: z.string().min(1) }),
]);

export const codexEntrySchema = z.object({
  id: z.string().min(1),
  category: z.enum(codexCategories),
  /** 所屬的地圖或章節（圖鑑畫面分組用，例如 glowmoss） */
  map: z.string().min(1),
  unlock: unlockSchema,
  /** 文字 key 前綴：生物有 .desc 介紹、.habitat 棲息地、.notes 行為與弱點；素材有 .source 來源（介紹用物品自己的說明）；記錄有 .title、.desc */
  textPrefix: z.string().min(1),
});
export type CodexEntry = z.infer<typeof codexEntrySchema>;
export type CodexUnlock = CodexEntry['unlock'];

/** 驗證圖鑑資料與它參照的敵人、物品、物件都存在 */
export function parseCodex(raw: unknown, refs: { enemies: ReadonlySet<string>; items: ReadonlySet<string>; placements: ReadonlySet<string> }): CodexEntry[] {
  const entries = z.array(codexEntrySchema).parse(raw);
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) throw new Error(`圖鑑條目 id 重複：${e.id}`);
    ids.add(e.id);
    const u = e.unlock;
    if (u.type === 'encounter' && !refs.enemies.has(u.enemy)) throw new Error(`圖鑑 ${e.id} 參照不存在的敵人：${u.enemy}`);
    if (u.type === 'item' && !refs.items.has(u.item)) throw new Error(`圖鑑 ${e.id} 參照不存在的物品：${u.item}`);
    if ((u.type === 'read' || u.type === 'activate') && !refs.placements.has(u.placement)) throw new Error(`圖鑑 ${e.id} 參照不存在的物件：${u.placement}`);
  }
  return entries;
}

/** 事件裡和圖鑑有關的線索（由權威層整理：交手的敵人種類、取得的物品、讀過 / 啟動的物件） */
export type CodexClues = { enemies: ReadonlySet<string>; items: ReadonlySet<string>; read: ReadonlySet<string>; activated: ReadonlySet<string> };

/** 這些線索會解鎖哪些還沒解鎖的條目（依資料順序） */
export function codexUnlocks(entries: readonly CodexEntry[], unlocked: readonly string[], clues: CodexClues): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (unlocked.includes(e.id)) continue;
    const u = e.unlock;
    const hit =
      (u.type === 'encounter' && clues.enemies.has(u.enemy)) ||
      (u.type === 'item' && clues.items.has(u.item)) ||
      (u.type === 'read' && clues.read.has(u.placement)) ||
      (u.type === 'activate' && clues.activated.has(u.placement));
    if (hit) out.push(e.id);
  }
  return out;
}

/** 完成度：已解鎖 / 全部（只算資料裡還存在的條目） */
export function codexProgress(entries: readonly CodexEntry[], unlocked: readonly string[], category?: CodexCategory): { unlocked: number; total: number } {
  const list = category ? entries.filter((e) => e.category === category) : entries;
  return { unlocked: list.filter((e) => unlocked.includes(e.id)).length, total: list.length };
}
