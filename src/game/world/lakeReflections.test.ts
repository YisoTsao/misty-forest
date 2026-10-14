// 任務 9C：伊芙與 quest_lake_001「湖面不肯忘記」（Bible §7.4、§21.5）——奧林在苔冠下的守衛之後交付；
// 三處不自然的倒影只在任務中能調查（調查時顯示倒影裡的景象）、調查完回報奧林領水鏡符號紀錄；伊芙在湖畔營地。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { countItem } from '@/game-core/inventory/inventory';
import { isQuestReady } from '@/game-core/quest/quest';
import { mapIdAt } from '@/game-core/world/maps';
import { worldDataResult } from '../worldData';
import { WorldIndex } from './worldIndex';

if (!worldDataResult.ok) throw new Error(worldDataResult.error);
const data = worldDataResult.data;
const index = new WorldIndex(data);
const ctx: RulesContext = {
  world: index,
  items: data.items,
  lootTables: data.lootTables,
  random: () => 0.5,
  quests: data.quests,
  combat: data.combat,
  weapons: data.weapons,
  spells: data.spells,
  buildables: data.buildables,
  allowDebugCommands: true,
};
const Q = 'quest_lake_001';
const REFLECTIONS = ['mirrorlake_reflection_camp', 'mirrorlake_reflection_isle', 'mirrorlake_reflection_ruins'];
const ok = (state: GameState, cmd: GameCommand) => {
  const events = handleCommand(state, cmd, ctx);
  const rejected = events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return { state: applyEvents(state, events, ctx), events };
};
const rejection = (state: GameState, cmd: GameCommand) => {
  const e = handleCommand(state, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
};
const npc = (id: string) => data.npcs.find((n) => n.id === id)!;
const talk = (s: GameState, id: string) => pickDialogue(npc(id).talk, s, { quests: data.quests });
const guarded = (): GameState => ({ ...initialGameState(), quests: { quest_dawn_003: { status: 'completed' }, quest_forest_003: { status: 'completed' }, quest_dawn_007: { status: 'completed' } } });

describe('quest_lake_001 湖面不肯忘記', () => {
  it('奧林在苔冠下的守衛完成後交付；之前不會', () => {
    expect(talk({ ...initialGameState(), quests: { quest_dawn_007: { status: 'completed' } } }, 'orin')).toBe('orin_after');
    expect(talk(guarded(), 'orin')).toBe('orin_lake_offer');
  });

  it('三處倒影都在澄鏡湖；調查時顯示倒影裡的景象（各自不同），之後換成淡下來的樣子', () => {
    const bodies = new Set<string>();
    for (const id of REFLECTIONS) {
      const p = index.placement(id)!;
      expect(mapIdAt(p.position[0], p.position[2])).toBe('mirrorlake');
      const activate = index.prefab(p.prefabId)!.activate!;
      expect(activate.quest).toBe(Q);
      expect(activate.model).toBe('procedural:odd_reflection_seen');
      bodies.add(activate.message!.bodyKey);
    }
    expect(bodies.size).toBe(3);
  });

  it('沒接任務不能調查；接了以後調查三處、回報奧林，拿到水鏡符號紀錄與星光碎屑', () => {
    expect(rejection(guarded(), { type: 'ActivateObject', placementId: REFLECTIONS[0]! })).toBe('quest-unavailable');
    let s = ok(guarded(), { type: 'AcceptQuest', quest: Q }).state;
    expect(talk(s, 'orin')).toBe('orin_lake_progress');
    expect(talk(s, 'eve')).toBe('eve_reflection');
    for (const id of REFLECTIONS) s = ok(s, { type: 'ActivateObject', placementId: id }).state;
    expect(isQuestReady(s, data.quests.get(Q)!)).toBe(true);
    expect(talk(s, 'orin')).toBe('orin_lake_turnin');
    const shards = countItem(s.inventory, 'starlight_shard');
    s = ok(s, { type: 'TurnInQuest', quest: Q }).state;
    expect(s.quests[Q]?.status).toBe('completed');
    expect(countItem(s.inventory, 'mirror_symbol_record')).toBe(1);
    expect(countItem(s.inventory, 'starlight_shard')).toBe(shards + 3);
    expect(talk(s, 'orin')).toBe('orin_after');
    expect(talk(s, 'eve')).toBe('eve_after_reflection');
  });

  it('伊芙在湖畔營地', () => {
    const eve = npc('eve');
    expect(mapIdAt(eve.position[0], eve.position[1])).toBe('mirrorlake');
    expect(eve.regionId).toBe('lake_camp');
    expect(talk(initialGameState(), 'eve')).toBe('eve_intro');
  });
});
