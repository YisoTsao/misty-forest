import { LocalAuthority } from '@/game-core/authority/authority';
import type { DialogueDef } from '@/game-core/dialogue/dialogue';
import type { NpcDef } from '@/game-core/npc/npc';
import type { QuestCatalog } from '@/game-core/quest/quest';
import type { CombatData } from '@/game-core/combat/combat';
import type { CompanionDef } from '@/game-core/companion/companion';
import type { RegionDef } from '@/game-core/world/regions';
import { initialGameState } from '@/game-core/authority/rules';
import { WorldIndex } from './world/worldIndex';
import { worldDataResult } from './worldData';

// 單人模式的權威層（規格 3.2）。所有權威狀態的改變都經由這裡送出指令。
// 世界資料驗證失敗時 App 會顯示錯誤畫面，不會進入遊戲；此時以空資料建立，避免模組載入就拋錯。
const data = worldDataResult.ok
  ? worldDataResult.data
  : {
      prefabs: new Map(),
      placements: [],
      items: new Map(),
      lootTables: new Map(),
      regions: [] as RegionDef[],
      dialogues: new Map<string, DialogueDef>(),
      npcs: [] as NpcDef[],
      quests: new Map() as QuestCatalog,
      combat: { enemies: new Map(), spawners: [] } as CombatData,
      companion: { nameKey: 'companion.name', hints: [{ textKey: 'companion.hint.village' }] } as CompanionDef,
    };

/** NPC 與對話資料 */
export const npcs: readonly NpcDef[] = data.npcs;
export const dialogues: ReadonlyMap<string, DialogueDef> = data.dialogues;
export const quests: QuestCatalog = data.quests;
export const combat: CombatData = data.combat;
export const companionDef: CompanionDef = data.companion;

/** 區域範圍（迷霧混合、區域名稱、生成規則使用） */
export const regions: readonly RegionDef[] = data.regions;

/** 除錯指令只在開發模式或帶 ?debug 時接受（與除錯 API 相同條件） */
const allowDebugCommands = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

/** 世界查詢索引（啟動時建立一次，之後唯讀） */
export const worldIndex = new WorldIndex(data);

export const authority = new LocalAuthority(initialGameState(), {
  world: worldIndex,
  items: data.items,
  lootTables: data.lootTables,
  random: Math.random,
  quests: data.quests,
  combat: data.combat,
  allowDebugCommands,
});
