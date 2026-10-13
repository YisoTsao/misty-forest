import prefabs from '@/data/prefabs.json';
import placements from '@/data/placements.json';
import bookmarks from '@/data/cameraBookmarks.json';
import items from '@/data/items.json';
import lootTables from '@/data/lootTables.json';
import regions from '@/data/regions.json';
import dialogues from '@/data/dialogues.json';
import npcs from '@/data/npcs.json';
import quests from '@/data/quests.json';
import enemies from '@/data/enemies.json';
import spawners from '@/data/spawners.json';
import companion from '@/data/companion.json';
import { parseGameData, type GameData } from '@/game-core/world/gameData';
import type { Vec3 } from '@/game-core/world/types';

export type WorldDataResult = { ok: true; data: GameData } | { ok: false; error: string };

/** 啟動時驗證一次；失敗交由 UI 顯示錯誤畫面，不得白畫面。 */
export const worldDataResult: WorldDataResult = (() => {
  try {
    return { ok: true, data: parseGameData({ prefabs, placements, items, lootTables, regions, dialogues, npcs, quests, enemies, spawners, companion }) };
  } catch (err) {
    console.error(err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
})();

export type CameraBookmark = { id: string; position: Vec3; target: Vec3 };
export const cameraBookmarks = bookmarks as CameraBookmark[];

/** 模型路徑以 Vite base 為基準，dev 與 file:// 都能解析。 */
export function assetUrl(relativePath: string): string {
  return `${import.meta.env.BASE_URL}${relativePath}`;
}
