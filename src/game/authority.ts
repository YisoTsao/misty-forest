import type { ShopCatalog } from '@/game-core/shop/shop';
import type { CraftData } from '@/game-core/craft/craft';
import { LocalAuthority } from '@/game-core/authority/authority';
import type { DialogueDef } from '@/game-core/dialogue/dialogue';
import type { NpcDef } from '@/game-core/npc/npc';
import type { QuestCatalog } from '@/game-core/quest/quest';
import type { CombatData } from '@/game-core/combat/combat';
import type { WeaponCatalog } from '@/game-core/combat/weapons';
import type { SpellCatalog } from '@/game-core/combat/spells';
import type { CompanionDef } from '@/game-core/companion/companion';
import type { BuildableCatalog } from '@/game-core/build/build';
import type { InteriorDef } from '@/game-core/world/interiors';
import type { FlockDef } from '@/game-core/ambient/sheep';
import type { RegionDef } from '@/game-core/world/regions';
import type { Landmark } from '@/game-core/map/markers';
import type { LightPathDef } from '@/game-core/world/lightPath';
import { initialGameState, modifiersOf } from '@/game-core/authority/rules';
import { parseHeroClasses, type HeroClassCatalog } from '@/game-core/character/heroClass';
import classesRaw from '@/data/classes.json';
import { characterIds } from './character/characters';
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
      buildables: new Map() as BuildableCatalog,
      interiors: new Map<string, InteriorDef>(),
      flocks: [] as FlockDef[],
      weapons: { weapons: new Map(), moves: new Map() } as WeaponCatalog,
      spells: new Map() as SpellCatalog,
      landmarks: [] as Landmark[],
      lightPaths: [] as LightPathDef[],
      shops: new Map() as ShopCatalog,
      crafting: { stations: [], recipes: [] } as CraftData,
    };

/** NPC 與對話資料 */
export const npcs: readonly NpcDef[] = data.npcs;
export const dialogues: ReadonlyMap<string, DialogueDef> = data.dialogues;
export const quests: QuestCatalog = data.quests;
export const combat: CombatData = data.combat;
export const companionDef: CompanionDef = data.companion;
export const buildables: BuildableCatalog = data.buildables;
/** 近戰武器與招式（GAME_DESIGN 5.3） */
export const weapons: WeaponCatalog = data.weapons;
/** 魔法（GAME_DESIGN 5.4） */
export const spells: SpellCatalog = data.spells;
/** 職業（使用者 2026-10-17）：資料讀不到時是空的（畫面會顯示資料錯誤） */
export const heroClasses: HeroClassCatalog = worldDataResult.ok
  ? parseHeroClasses(classesRaw, { weapons: data.weapons, spells: data.spells, characters: new Set(characterIds()) })
  : new Map();
export const interiors: ReadonlyMap<string, InteriorDef> = data.interiors;
/** 羊群的牧草地（環境動畫） */
export const flocks: readonly FlockDef[] = data.flocks;

/** 世界地圖的地標（任務 7B） */
export const landmarks: readonly Landmark[] = data.landmarks;

export const lightPaths: readonly LightPathDef[] = data.lightPaths;

/** 商店（任務 7H） */
export const shops: ShopCatalog = data.shops;

/** 工作台與配方（任務 7J） */
export const crafting: CraftData = data.crafting;

/** 區域範圍（迷霧混合、區域名稱、生成規則使用） */
export const regions: readonly RegionDef[] = data.regions;

/** 除錯指令只在開發模式或帶 ?debug 時接受（與除錯 API 相同條件） */
const allowDebugCommands = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

/** 世界查詢索引（啟動時建立一次，之後唯讀） */
export const worldIndex = new WorldIndex(data);

/** 目前的被動效果與裝備倍率（裝備系統，Phase 2） */
export const currentModifiers = () => modifiersOf(authority.getState(), { items: data.items });

export const authority = new LocalAuthority(initialGameState(), {
  world: worldIndex,
  items: data.items,
  lootTables: data.lootTables,
  random: Math.random,
  quests: data.quests,
  combat: data.combat,
  weapons: data.weapons,
  spells: data.spells,
  heroClasses,
  buildables: data.buildables,
  lightPaths: data.lightPaths,
  shops: data.shops,
  crafting: data.crafting,
  isOccupied: (x, z, margin) => worldIndex.isOccupied(x, z, margin),
  allowDebugCommands,
});
