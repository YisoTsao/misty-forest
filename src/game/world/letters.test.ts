// 任務 7G：quest_dawn_004「郵袋裡的三封信」（Bible §22.1）以實際資料走完——尼可在木橋修好後出現、接取時拿到三封信、
// 乾布只在任務中能撿、送信的順序自由（第一封有不同的回應，尼可依第一封換感謝語）、回報交出乾布領明信片與種籽幣。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameEvent, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { evaluateCondition } from '@/game-core/dialogue/conditions';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { countItem } from '@/game-core/inventory/inventory';
import { questMarkers } from '@/game-core/map/markers';
import { isQuestReady, objectiveProgress, questStatus } from '@/game-core/quest/quest';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
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
  waterways: data.waterways,
  allowDebugCommands: true,
};
const condCtx = { quests: data.quests };
const Q = 'quest_dawn_004';
const quest = data.quests.get(Q)!;
const CLOTH = ['village_dry_cloth_01', 'village_dry_cloth_02'];

function run(state: GameState, cmd: GameCommand): { state: GameState; events: GameEvent[] } {
  const events = handleCommand(state, cmd, ctx);
  return { state: applyEvents(state, events, ctx), events };
}
function ok(state: GameState, cmd: GameCommand) {
  const r = run(state, cmd);
  const rejected = r.events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return r;
}
function rejection(state: GameState, cmd: GameCommand): string | null {
  const e = handleCommand(state, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
}
const npc = (id: string) => data.npcs.find((n) => n.id === id)!;
const talk = (state: GameState, id: string) => pickDialogue(npc(id).talk, state, condCtx);

function bridged(): GameState {
  return { ...initialGameState(), quests: { wood_for_bridge: { status: 'completed' }, repair_bridge: { status: 'completed' } } };
}
function accepted(): GameState {
  return ok(bridged(), { type: 'AcceptQuest', quest: Q }).state;
}

describe('quest_dawn_004 郵袋裡的三封信', () => {
  it('尼可在木橋修好後才出現；任務是角色故事、木橋修好後可接', () => {
    expect(evaluateCondition(npc('niko').visible, initialGameState(), condCtx)).toBe(false);
    expect(evaluateCondition(npc('niko').visible, bridged(), condCtx)).toBe(true);
    expect(quest.category).toBe('story');
    expect(questStatus(bridged(), quest)).toBe('available');
    expect(talk(bridged(), 'niko')).toBe('niko_offer');
  });

  it('接取時拿到三封信；乾布只在任務中能撿', () => {
    expect(rejection(bridged(), { type: 'HarvestObject', placementId: CLOTH[0]! })).toBe('quest-unavailable');
    const s = accepted();
    for (const id of ['letter_elder', 'letter_balu', 'letter_linna']) expect(countItem(s.inventory, id), id).toBe(1);
    expect(rejection(s, { type: 'HarvestObject', placementId: CLOTH[0]! })).toBeNull();
    expect(talk(s, 'niko')).toBe('niko_progress');
  });

  it('送信：第一封有不同的回應；交出信、記錄順序；同一位不能送兩次', () => {
    let s = accepted();
    expect(talk(s, 'balu')).toBe('balu_letter_first');
    expect(talk(s, 'elder')).toBe('elder_letter_first');
    const r = ok(s, { type: 'QuestTalk', quest: Q, npc: 'balu' });
    expect(r.events).toEqual([
      { type: 'ItemsRemoved', items: [{ itemId: 'letter_balu', count: 1 }], reason: 'quest' },
      { type: 'QuestProgressed', quest: Q, objective: 2, count: 1 },
    ]);
    s = r.state;
    expect(rejection(s, { type: 'QuestTalk', quest: Q, npc: 'balu' })).toBe('already-active');
    expect(talk(s, 'elder')).toBe('elder_letter');
    // 送完的人回到平常的對話
    expect(talk(s, 'balu')).not.toMatch(/letter/);
    s = ok(s, { type: 'QuestTalk', quest: Q, npc: 'linna' }).state;
    expect(s.quests[Q]?.progress?.[3]).toBe(2);
    // 不是收信人的 NPC 不行
    expect(rejection(s, { type: 'QuestTalk', quest: Q, npc: 'leo' })).toBe('invalid-command');
  });

  it('身上沒有信就送不出去', () => {
    const s = accepted();
    const noLetter = { ...s, inventory: run(s, { type: 'QuestTalk', quest: Q, npc: 'elder' }).state.inventory };
    const again = { ...noLetter, quests: { ...noLetter.quests, [Q]: { status: 'active' as const } } };
    expect(rejection(again, { type: 'QuestTalk', quest: Q, npc: 'elder' })).toBe('missing-materials');
  });

  it('全部完成後回報：尼可依第一封換感謝語、交出乾布、領到明信片與種籽幣', () => {
    for (const first of ['elder', 'balu', 'linna'] as const) {
      let s = accepted();
      for (const id of CLOTH) s = ok(s, { type: 'HarvestObject', placementId: id }).state;
      const order = [first, ...(['elder', 'balu', 'linna'] as const).filter((n) => n !== first)];
      for (const n of order) s = ok(s, { type: 'QuestTalk', quest: Q, npc: n }).state;
      expect(isQuestReady(s, quest)).toBe(true);
      expect(talk(s, 'niko')).toBe(`niko_turnin_${first}`);
      s = ok(s, { type: 'TurnInQuest', quest: Q }).state;
      expect(countItem(s.inventory, 'dry_cloth')).toBe(0);
      expect(countItem(s.inventory, 'postcard_blank')).toBe(3);
      expect(countItem(s.inventory, 'seed_coin')).toBe(30);
      expect(talk(s, 'niko')).toBe('niko_after');
    }
  });

  it('世界地圖標出還沒送信的收信人；存讀檔保留送信順序', () => {
    let s = ok(accepted(), { type: 'QuestTalk', quest: Q, npc: 'elder' }).state;
    const positions: Record<string, { x: number; z: number }> = { elder: { x: 1, z: 1 }, balu: { x: 2, z: 2 }, linna: { x: 3, z: 3 }, niko: { x: 4, z: 4 } };
    const marks = questMarkers(s, data.quests, { npcPosition: (id) => positions[id] ?? null, placement: (id) => index.placement(id), spawners: [] }).filter((m) => m.questId === Q);
    expect(marks.map((m) => m.x).sort()).toEqual([2, 3]);
    s = fromSaveData(toSaveData(s, { position: { x: 0, y: 0, z: 0 }, facingYaw: 0 }, new Date()), ctx).state;
    expect(objectiveProgress(s, quest)[1]).toEqual({ current: 1, target: 1 });
    expect(s.quests[Q]?.progress?.[1]).toBe(1);
  });
});
