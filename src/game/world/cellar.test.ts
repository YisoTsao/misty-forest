// 任務 7M：奧林與 quest_dawn_007「燈塔下的影子」（Bible §4.7、§22.1）——地窖門只在任務中、夜裡打得開（說明原因）、
// 三塊符號石片只在任務中能撿、放回石環（交出三塊）、回報領共鳴石板；地窖是第二個室內子場景。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { countItem } from '@/game-core/inventory/inventory';
import { isQuestReady } from '@/game-core/quest/quest';
import { isGateOpen } from '@/game-core/world/gates';
import { interiorAt } from '@/game-core/world/interiors';
import { DAY_REAL_SECONDS, START_HOUR } from '@/game-core/world/timeOfDay';
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
const Q = 'quest_dawn_007';
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
const orin = data.npcs.find((n) => n.id === 'orin')!;
const talk = (s: GameState) => pickDialogue(orin.talk, s, { quests: data.quests });
const lit = (): GameState => ({ ...initialGameState(), quests: { quest_dawn_003: { status: 'completed' } } });
/** 遊戲時間：第 0 天的 hour 點（新遊戲從 START_HOUR 開始） */
const at = (hour: number) => ((hour - START_HOUR + 24) % 24) * (DAY_REAL_SECONDS / 24);
const hatch = index.prefab(index.placement('highland_cellar_hatch')!.prefabId)!.enter!;
const STONES = ['cellar_symbol_dawn', 'cellar_symbol_sprout', 'cellar_symbol_tide'];

describe('quest_dawn_007 燈塔下的影子', () => {
  it('奧林在古樹遺跡；燈塔點亮前只說早期的台詞，之後交付任務', () => {
    expect(talk(initialGameState())).toBe('orin_intro');
    expect(talk(lit())).toBe('orin_shadow_offer');
  });

  it('地窖門：沒接任務、白天都打不開；接了任務的夜裡打得開', () => {
    const s = ok(lit(), { type: 'AcceptQuest', quest: Q }).state;
    expect(isGateOpen(hatch, lit().quests, at(22))).toBe(false);
    expect(isGateOpen(hatch, s.quests, at(12))).toBe(false);
    expect(isGateOpen(hatch, s.quests, at(22))).toBe(true);
    expect(isGateOpen(hatch, s.quests, at(3))).toBe(true);
  });

  it('地窖是室內子場景，石環與石片都在裡面', () => {
    const cellar = data.interiors.get('lighthouse_cellar')!;
    for (const id of ['cellar_stone_ring', ...STONES]) {
      const p = index.placement(id)!;
      expect(interiorAt(data.interiors, p.position[0], p.position[2])?.id, id).toBe(cellar.id);
    }
  });

  it('石片只在任務中能撿；三塊都放回石環才算完成；回報領共鳴石板與種籽幣', () => {
    expect(rejection(lit(), { type: 'HarvestObject', placementId: STONES[0]! })).toBe('quest-unavailable');
    let s = ok(lit(), { type: 'AcceptQuest', quest: Q }).state;
    s = ok(s, { type: 'HarvestObject', placementId: STONES[0]! }).state;
    expect(rejection(s, { type: 'ActivateObject', placementId: 'cellar_stone_ring' })).toBe('missing-materials');
    for (const id of STONES.slice(1)) s = ok(s, { type: 'HarvestObject', placementId: id }).state;
    s = ok(s, { type: 'ActivateObject', placementId: 'cellar_stone_ring' }).state;
    for (const item of ['symbol_stone_dawn', 'symbol_stone_sprout', 'symbol_stone_tide']) expect(countItem(s.inventory, item)).toBe(0);
    expect(isQuestReady(s, data.quests.get(Q)!)).toBe(true);
    expect(talk(s)).toBe('orin_shadow_turnin');
    s = ok(s, { type: 'TurnInQuest', quest: Q }).state;
    expect(countItem(s.inventory, 'lore_tablet_resonance_01')).toBe(1);
    expect(countItem(s.inventory, 'seed_coin')).toBe(40);
    // 過渡期間澄鏡湖只要求第一章完成（T-187）：影子的任務結束後，奧林接著提起澄鏡湖
    expect(talk(s)).toBe('orin_lake_offer');
  });
});
