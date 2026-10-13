// 規則測試共用的小型世界：寶箱、可採集的樹（會重生）與花（不重生）、不可互動的岩石。
import type { RulesContext } from '../authority/rules';
import type { ItemDef, LootTable } from '../items/items';
import type { QuestDef } from '../quest/quest';
import { mulberry32 } from '../util/random';
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
    contents: { lootTableId: 'chest_loot' },
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
];

export const testPlacements: Placement[] = [
  { id: 'c1', prefabId: 'chest', regionId: 'meadow', position: [0, 0, 0] },
  { id: 'c2', prefabId: 'empty_chest', regionId: 'meadow', position: [3, 0, 0] },
  { id: 't1', prefabId: 'tree', regionId: 'meadow', position: [10, 0, 0] },
  { id: 't2', prefabId: 'tree', regionId: 'forest', position: [20, 0, 0] },
  { id: 'f1', prefabId: 'flower', regionId: 'meadow', position: [30, 0, 0] },
  { id: 'r1', prefabId: 'rock', regionId: 'meadow', position: [40, 0, 0] },
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
    descKey: 'q.gather.desc',
    giver: 'npc_a',
    requires: [],
    objectives: [{ type: 'collect', itemId: 'wood', count: 4, consume: true }],
    rewards: { items: [{ itemId: 'shard', count: 1 }] },
  },
  {
    id: 'clear',
    nameKey: 'q.clear',
    descKey: 'q.clear.desc',
    giver: 'npc_a',
    requires: ['gather'],
    objectives: [{ type: 'collect', itemId: 'flower', count: 1, consume: false }],
    rewards: { mist: [{ region: 'forest', stage: 'clear' }] },
  },
];

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
  };
}
