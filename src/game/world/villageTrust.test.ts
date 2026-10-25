// 主線 CH2-MQ-04 不願相信旅人的居民（2026-10-25 改版，docs/CHAPTER_02_REVIEW.md 方案 A）：
// 和菇伯、菇丁（送一顆微光孢子）、菇哨談過，三個人都點頭後才能向菇菇婆婆回報，拿到螢光提燈。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { evaluateCondition } from '@/game-core/dialogue/conditions';
import { countItem } from '@/game-core/inventory/inventory';
import { isQuestReady } from '@/game-core/quest/quest';
import { npcs } from '../authority';
import { worldDataResult } from '../worldData';
import { WorldIndex } from './worldIndex';

if (!worldDataResult.ok) throw new Error(worldDataResult.error);
const data = worldDataResult.data;
const ctx: RulesContext = {
  world: new WorldIndex(data),
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
const run = (s: GameState, cmd: GameCommand) => {
  const events = handleCommand(s, cmd, ctx);
  return { state: applyEvents(s, events, ctx), events };
};
const quest = data.quests.get('quest_forest_004')!;
const talk = (s: GameState, npc: string) => run(s, { type: 'QuestTalk', quest: 'quest_forest_004', npc });
/** NPC 目前會用哪一段對話（第一條成立的規則） */
const dialogueOf = (s: GameState, npc: string) => npcs.find((n) => n.id === npc)!.talk.find((r) => !r.when || evaluateCondition(r.when, s, { quests: data.quests }))!.dialogue;

describe('不願相信旅人的居民', () => {
  const start = () => run({ ...initialGameState(), quests: { quest_forest_003: { status: 'completed' } } }, { type: 'AcceptQuest', quest: 'quest_forest_004' }).state;

  it('三位居民都談過才算完成；菇丁要一顆微光孢子', () => {
    let s = start();
    s = talk(s, 'mush_farmer').state;
    expect(isQuestReady(s, quest)).toBe(false);
    // 沒有孢子：菇丁那一關過不了
    expect(talk(s, 'mush_kid').events[0]).toMatchObject({ type: 'CommandRejected', reason: 'missing-materials' });
    s = run(s, { type: 'DebugGiveItems', items: [{ itemId: 'glow_spore', count: 2 }] }).state;
    s = talk(s, 'mush_kid').state;
    expect(countItem(s.inventory, 'glow_spore')).toBe(1);
    s = talk(s, 'mush_lookout').state;
    expect(isQuestReady(s, quest)).toBe(true);
    s = run(s, { type: 'TurnInQuest', quest: 'quest_forest_004' }).state;
    expect(s.quests.quest_forest_004?.status).toBe('completed');
    expect(countItem(s.inventory, 'glow_lantern')).toBe(1);
  });

  it('居民的對話跟著進度換：任務前戒備、任務中出題、談過後叫你去找婆婆、完成後友善', () => {
    const before: GameState = { ...initialGameState(), quests: { quest_forest_003: { status: 'completed' } } };
    expect(dialogueOf(before, 'mush_farmer')).toBe('mush_farmer_wary');
    let s = start();
    expect(dialogueOf(s, 'mush_farmer')).toBe('mush_farmer_quest');
    expect(dialogueOf(s, 'mush_kid')).toBe('mush_kid_quest_need');
    s = run(s, { type: 'DebugGiveItems', items: [{ itemId: 'glow_spore', count: 1 }] }).state;
    expect(dialogueOf(s, 'mush_kid')).toBe('mush_kid_quest');
    s = talk(s, 'mush_kid').state;
    expect(dialogueOf(s, 'mush_kid')).toBe('mush_kid_quest_wait');
    s = talk(talk(s, 'mush_farmer').state, 'mush_lookout').state;
    s = run(s, { type: 'TurnInQuest', quest: 'quest_forest_004' }).state;
    expect(dialogueOf(s, 'mush_lookout')).toBe('mush_lookout_trust');
  });
});
