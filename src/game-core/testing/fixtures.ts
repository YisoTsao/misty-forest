// 規則測試共用的小型世界：寶箱、可採集的樹（會重生）與花（不重生）、不可互動的岩石。
import type { RulesContext } from '../authority/rules';
import type { ItemDef, LootTable } from '../items/items';
import type { QuestDef } from '../quest/quest';
import type { EnemyDef, SpawnerDef } from '../combat/combat';
import type { BuildableDef } from '../build/build';
import { mulberry32 } from '../util/random';
import { parseWeapons } from '../combat/weapons';
import weaponsJson from '../../data/weapons.json';
import { parseSpells } from '../combat/spells';
import spellsJson from '../../data/spells.json';
import type { WorldLookup } from '../world/objects';
import type { Placement, Prefab } from '../world/types';

export const testPrefabs: Prefab[] = [
  {
    id: 'chest',
    model: 'chest.glb',
    collider: 'static',
    collision: { shape: 'box', size: [1, 1, 1] },
    interaction: 'open',
    nameKey: 'object.chest',
    contents: { lootTableId: 'chest_loot', unlocksCompanion: true },
    persists: true,
  },
  { id: 'empty_chest', model: 'chest.glb', collider: 'none', interaction: 'open', nameKey: 'object.chest', persists: true },
  {
    id: 'tree',
    model: 'tree.gltf',
    collider: 'none',
    interaction: 'harvest',
    nameKey: 'object.tree',
    harvest: { lootTableId: 'wood', respawnSec: 100 },
    persists: true,
  },
  { id: 'flower', model: 'procedural:flower_patch', collider: 'none', interaction: 'harvest', nameKey: 'object.flower', harvest: { lootTableId: 'flower' }, persists: true },
  { id: 'rock', model: 'rock.gltf', collider: 'none', persists: false },
  {
    id: 'bridge',
    model: 'procedural:wood_bridge_broken',
    collider: 'none',
    interaction: 'repair',
    nameKey: 'object.bridge',
    repair: { model: 'procedural:wood_bridge', materials: [{ itemId: 'wood', count: 3 }], quest: 'mend' },
    persists: true,
  },
];

export const testPlacements: Placement[] = [
  { id: 'c1', prefabId: 'chest', regionId: 'meadow', position: [0, 0, 0] },
  { id: 'c2', prefabId: 'empty_chest', regionId: 'meadow', position: [3, 0, 0] },
  { id: 't1', prefabId: 'tree', regionId: 'meadow', position: [10, 0, 0] },
  { id: 't2', prefabId: 'tree', regionId: 'forest', position: [20, 0, 0] },
  { id: 'f1', prefabId: 'flower', regionId: 'meadow', position: [30, 0, 0] },
  { id: 'r1', prefabId: 'rock', regionId: 'meadow', position: [40, 0, 0] },
  { id: 'b1', prefabId: 'bridge', regionId: 'lake', position: [50, 0, 0] },
];

export const testItems: ItemDef[] = [
  { id: 'wood', nameKey: 'item.wood.name', descKey: 'item.wood.desc', icon: 'wood', category: 'material', maxStack: 10 },
  { id: 'flower', nameKey: 'item.flower.name', descKey: 'item.flower.desc', icon: 'flower', category: 'material', maxStack: 99 },
  { id: 'shard', nameKey: 'item.starlight_shard.name', descKey: 'item.starlight_shard.desc', icon: 'starlight', category: 'special', maxStack: 1 },
];

export const testLootTables: LootTable[] = [
  { id: 'wood', drops: [{ itemId: 'wood', min: 2, max: 2 }] },
  { id: 'flower', drops: [{ itemId: 'flower', min: 1, max: 1 }] },
  { id: 'chest_loot', drops: [{ itemId: 'shard', min: 1, max: 1 }] },
];

export const testQuests: QuestDef[] = [
  {
    id: 'gather',
    nameKey: 'q.gather',
    category: 'side',
    descKey: 'q.gather.desc',
    giver: 'npc_a',
    requires: [],
    objectives: [{ type: 'collect', itemId: 'wood', count: 4, consume: true }],
    rewards: { items: [{ itemId: 'shard', count: 1 }] },
  },
  {
    id: 'clear',
    nameKey: 'q.clear',
    category: 'side',
    descKey: 'q.clear.desc',
    giver: 'npc_a',
    requires: ['gather'],
    objectives: [{ type: 'collect', itemId: 'flower', count: 1, consume: false }],
    rewards: { mist: [{ region: 'forest', stage: 'clear' }] },
  },
  {
    id: 'mend',
    nameKey: 'q.mend',
    category: 'side',
    descKey: 'q.mend.desc',
    giver: 'npc_a',
    requires: [],
    objectives: [{ type: 'repair', placementId: 'b1', descKey: 'q.mend.obj' }],
    rewards: { mist: [{ region: 'lake', stage: 'clear' }] },
  },
  {
    id: 'hunt',
    nameKey: 'q.hunt',
    category: 'side',
    descKey: 'q.hunt.desc',
    giver: 'npc_a',
    requires: [],
    objectives: [{ type: 'defeat', enemy: 'wisp', count: 3, descKey: 'q.hunt.obj', milestones: [{ count: 2, region: 'forest', stage: 'light' }] }],
    rewards: { mist: [{ region: 'forest', stage: 'clear' }] },
  },
];

export const testEnemies: EnemyDef[] = [
  {
    id: 'wisp',
    nameKey: 'enemy.wisp',
    maxHp: 50,
    damage: 30,
    moveSpeed: 3,
    aggroRadius: 8,
    attackRange: 1.5,
    attackWindup: 0.5,
    attackCooldown: 1.5,
    leashRadius: 15,
    lootTableId: 'flower',
  },
];

export const testSpawners: SpawnerDef[] = [
  { id: 'sp', regionId: 'forest', enemy: 'wisp', center: [100, 0], radius: 5, budget: { dense: 2, light: 1, clear: 0 }, respawnSec: 10 },
];

export const testBuildables: BuildableDef[] = [
  { id: 'fire', nameKey: 'b.fire', prefabId: 'rock', scale: 1, footprint: 0.7, category: 'structure', icon: 'campfire', cost: [{ itemId: 'wood', count: 3 }] },
  { id: 'stool', nameKey: 'b.stool', prefabId: 'rock', scale: 1, footprint: 0.3, category: 'furniture', icon: 'stool', cost: [{ itemId: 'wood', count: 1 }] },
];

/** 規則測試用的武器：直接使用正式資料（招式 id 與傷害由 data/weapons.json 決定） */
export const testWeapons = parseWeapons(weaponsJson);
/** 規則測試用的法術：正式資料（data/spells.json） */
export const testSpells = parseSpells(spellsJson);

export const testWorld: WorldLookup = {
  placement: (id) => testPlacements.find((p) => p.id === id),
  prefab: (id) => testPrefabs.find((p) => p.id === id),
};

export function testContext(seed = 1): RulesContext {
  return {
    world: testWorld,
    items: new Map(testItems.map((i) => [i.id, i])),
    lootTables: new Map(testLootTables.map((t) => [t.id, t])),
    random: mulberry32(seed),
    quests: new Map(testQuests.map((q) => [q.id, q])),
    combat: { enemies: new Map(testEnemies.map((e) => [e.id, e])), spawners: testSpawners },
    buildables: new Map(testBuildables.map((b) => [b.id, b])),
    weapons: testWeapons,
    spells: testSpells,
  };
}
