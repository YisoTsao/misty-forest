// 第二章結尾（規格 CH2-MQ-07、08，§2.4）：淨化根噬者後向菇菇婆婆回報拿到古樹核心、接下「湖面上的倒影」；
// 在祭壇觀看古樹核心的記憶、走到澄鏡湖的入口 → 任務自動完成，往澄鏡湖的出口打開（第三章解鎖）。
// 支線 CH2-SQ-06 守護者的夢：淨化後回祭壇聽守護者說夢，回報菇菇婆婆拿到古樹守護符（護符格）。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { countItem } from '@/game-core/inventory/inventory';
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
const ok = (s: GameState, cmd: GameCommand) => {
  const r = run(s, cmd);
  const rejected = r.events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return r.state;
};
const exit = data.quests.get('quest_forest_008')!.objectives.find((o) => o.type === 'visit')!;

describe('第二章結尾', () => {
  it('回報 quest_forest_007 拿到古樹核心；菇菇婆婆的回報對話接下 quest_forest_008', () => {
    const won: GameState = { ...initialGameState(), quests: { quest_forest_007: { status: 'active' } }, defeatedBosses: ['boss_root_devourer'] };
    const s = ok(won, { type: 'TurnInQuest', quest: 'quest_forest_007' });
    expect(countItem(s.inventory, 'ancient_core')).toBe(1);
    // 古樹恢復呼吸：祭壇放晴、迷霧深層降為淡霧（濃霧傷害只在濃霧時有）
    expect([s.mist.ancient_altar, s.mist.deep_mist]).toEqual(['clear', 'light']);
    const turnin = data.dialogues.get('granny_root_turnin')!;
    const effects = Object.values(turnin.nodes).flatMap((n) => (n.options ?? []).flatMap((o) => o.effects ?? []));
    expect(effects).toContainEqual({ type: 'acceptQuest', quest: 'quest_forest_008' });
    expect(ok(s, { type: 'AcceptQuest', quest: 'quest_forest_008' }).quests.quest_forest_008?.status).toBe('active');
  });

  it('古樹的記憶只有任務進行中能看；看完再走到出口，任務自動完成', () => {
    const base: GameState = { ...initialGameState(), quests: { quest_forest_007: { status: 'completed' } } };
    expect(run(base, { type: 'ActivateObject', placementId: 'ancient_memory_01' }).events[0]?.type).toBe('CommandRejected');
    let s = ok(base, { type: 'AcceptQuest', quest: 'quest_forest_008' });
    s = ok(s, { type: 'ActivateObject', placementId: 'ancient_memory_01' });
    expect(s.quests.quest_forest_008?.status).toBe('active');
    if (exit.type !== 'visit') throw new Error('沒有出口目標');
    s = ok(s, { type: 'ExploreArea', x: exit.x, z: exit.z });
    expect(s.quests.quest_forest_008?.status).toBe('completed');
  });

  it('守護者的夢：007 完成後可接；和守護者說完話才可回報，拿到護符格的古樹守護符', () => {
    let s: GameState = { ...initialGameState(), quests: { quest_forest_007: { status: 'completed' } }, defeatedBosses: ['boss_root_devourer'] };
    s = ok(s, { type: 'AcceptQuest', quest: 'quest_forest_sq06' });
    expect(run(s, { type: 'TurnInQuest', quest: 'quest_forest_sq06' }).events[0]?.type).toBe('CommandRejected');
    s = ok(s, { type: 'QuestTalk', quest: 'quest_forest_sq06', npc: 'root_guardian' });
    s = ok(s, { type: 'TurnInQuest', quest: 'quest_forest_sq06' });
    expect(countItem(s.inventory, 'guardian_charm')).toBe(1);
    expect(data.items.get('guardian_charm')?.equip?.slot).toBe('charm');
  });
});
