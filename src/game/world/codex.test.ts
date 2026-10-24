// 圖鑑（第二章規格 §11.3）：怪物交手、素材取得、讀石碑、看古樹的記憶時解鎖；同一條只解鎖一次；存讀檔保留，舊存檔沒有圖鑑也能讀。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameEvent, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { codexProgress } from '@/game-core/codex/codex';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
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
  codex: data.codex,
  allowDebugCommands: true,
};
const run = (s: GameState, cmd: GameCommand): { state: GameState; events: GameEvent[] } => {
  const events = handleCommand(s, cmd, ctx);
  return { state: applyEvents(s, events, ctx), events };
};
const unlockedBy = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'CodexUnlocked' ? e.entries : []));
const withWisp = (): GameState => ({ ...initialGameState(), enemies: new Map([['w', { id: 'w', kind: 'mob_fog_wisp', spawner: 'deep_wisps', hp: 34 }]]) });

describe('圖鑑', () => {
  it('第二章的生物、素材、記錄都有條目', () => {
    for (const c of ['creature', 'material', 'lore'] as const) expect(codexProgress(data.codex, [], c).total).toBeGreaterThan(3);
  });

  it('打到怪物時解鎖牠的條目；同一條不會再解鎖', () => {
    const r = run(withWisp(), { type: 'AttackEnemy', enemyId: 'w', attack: 'spell_starlight_burst' });
    expect(unlockedBy(r.events)).toEqual(['creature_fog_wisp']);
    expect(r.state.codex).toEqual(['creature_fog_wisp']);
    expect(unlockedBy(run(r.state, { type: 'AttackEnemy', enemyId: 'w', attack: 'spell_starlight_burst' }).events)).toEqual([]);
  });

  it('被怪物打到也算交手', () => {
    expect(unlockedBy(run(withWisp(), { type: 'EnemyStrike', enemyId: 'w', spit: true }).events)).toEqual(['creature_fog_wisp']);
  });

  it('頭目戰開始時解鎖頭目', () => {
    const s: GameState = { ...initialGameState(), quests: { quest_forest_007: { status: 'active' } } };
    expect(unlockedBy(run(s, { type: 'StartBossFight', boss: 'boss_root_devourer' }).events)).toEqual(['creature_root_devourer']);
  });

  it('第一次取得素材時解鎖（一次拿到兩種就解鎖兩條）', () => {
    const r = run(initialGameState(), { type: 'DebugGiveItems', items: [{ itemId: 'moss_gel', count: 1 }, { itemId: 'mist_fang', count: 2 }] });
    expect(unlockedBy(r.events).sort()).toEqual(['material_mist_fang', 'material_moss_gel']);
  });

  it('讀古代石碑解鎖記錄；沒有條目的告示牌只有 ObjectRead', () => {
    expect(unlockedBy(run(initialGameState(), { type: 'ReadObject', placementId: 'creek_tablet' }).events)).toEqual(['lore_creek_tablet']);
    const board = run(initialGameState(), { type: 'ReadObject', placementId: 'village_board' });
    expect(board.events).toEqual([{ type: 'ObjectRead', placementId: 'village_board' }]);
    expect(handleCommand(initialGameState(), { type: 'ReadObject', placementId: 'creek_wheel_01' }, ctx)[0]).toMatchObject({ reason: 'wrong-interaction' });
  });

  it('被拒絕的指令不解鎖', () => {
    expect(unlockedBy(handleCommand(initialGameState(), { type: 'AttackEnemy', enemyId: 'nobody', attack: 'spell_starlight_burst' }, ctx))).toEqual([]);
  });

  it('存讀檔保留；舊存檔（沒有 codex 欄位）讀進來是空的', () => {
    const s = run(initialGameState(), { type: 'ReadObject', placementId: 'star_tablet' }).state;
    const save = toSaveData(s, { position: { x: 0, y: 0, z: 0 }, facingYaw: 0 }, new Date());
    expect(fromSaveData(save, ctx).state.codex).toEqual(['lore_star_tablet']);
    const old = { ...save };
    delete (old as Partial<typeof save>).codex;
    expect(fromSaveData(old, ctx).state.codex).toEqual([]);
  });
});
