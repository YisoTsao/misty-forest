// 第二章 M-04 幻霧螢靈（規格 §6.2）：光球命中時短暫致盲；平常是幻影（減傷），帶著螢光提燈靠近時現形一段時間。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, modifiersOf, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { stanceDamageScale } from '@/game-core/combat/combat';
import { aiStance, createEnemyAi, stepEnemyAi, type AiInput } from '@/game-core/combat/enemyAi';
import { addItems } from '@/game-core/inventory/inventory';
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
const WISP = 'mob_fog_wisp';
const wisp = data.combat.enemies.get(WISP)!;
const veil = wisp.veil!;

const step = (ai: ReturnType<typeof createEnemyAi>, input: Partial<AiInput> & { player: AiInput['player'] }) =>
  stepEnemyAi(ai, wisp, { dt: 0.1, home: { x: 0, z: 0, radius: 4 }, random: () => 0.5, ...input });

describe('幻霧螢靈', () => {
  it('螢光提燈有「照出幻影」的被動效果（持有即生效）', () => {
    const s = initialGameState();
    expect(modifiersOf(s, ctx).revealVeil).toBe(false);
    const inventory = addItems(s.inventory, [{ itemId: 'glow_lantern', count: 1 }], data.items)!;
    expect(modifiersOf({ ...s, inventory }, ctx).revealVeil).toBe(true);
  });

  it('沒有提燈時一直是幻影（傷害 × scale）；帶著提燈靠近就現形，離開後維持 revealSec 秒', () => {
    const ai = createEnemyAi(0, 0);
    const near = { x: 0, z: veil.revealRadius - 1, alive: true };
    step(ai, { player: near });
    expect(aiStance(ai, wisp)).toBe('veiled');
    expect(stanceDamageScale(wisp, 'veiled')).toBe(veil.scale);
    step(ai, { player: near, lantern: true });
    expect(aiStance(ai, wisp)).toBeUndefined();
    // 太遠照不到：時間到又變回幻影
    const far = { x: 0, z: 40, alive: true };
    for (let t = 0; t < veil.revealSec - 0.3; t += 0.1) step(ai, { player: far, lantern: true });
    expect(aiStance(ai, wisp)).toBeUndefined();
    for (let t = 0; t < 0.6; t += 0.1) step(ai, { player: far, lantern: true });
    expect(aiStance(ai, wisp)).toBe('veiled');
  });

  it('權威層：幻影時受到的傷害打折，現形時全額', () => {
    const spawned: GameState = { ...initialGameState(), enemies: new Map([['w', { id: 'w', kind: WISP, spawner: 'deep_wisps', hp: wisp.maxHp }]]) };
    const dmg = (stance?: 'veiled') => {
      const e = handleCommand(spawned, stance ? { type: 'AttackEnemy', enemyId: 'w', attack: 'spell_starlight_burst', stance } : { type: 'AttackEnemy', enemyId: 'w', attack: 'spell_starlight_burst' }, ctx)[0];
      return e?.type === 'EnemyDamaged' ? e.amount : -1;
    };
    expect(dmg('veiled')).toBeLessThan(dmg());
    expect(dmg('veiled')).toBe(Math.round(dmg() * veil.scale));
  });

  it('光球命中：扣血、變慢，並短暫致盲', () => {
    const s: GameState = { ...initialGameState(), enemies: new Map([['w', { id: 'w', kind: WISP, spawner: 'deep_wisps', hp: wisp.maxHp }]]) };
    const events = handleCommand(s, { type: 'EnemyStrike', enemyId: 'w', spit: true }, ctx);
    expect(events.map((e) => e.type)).toEqual(['PlayerDamaged', 'PlayerSlowed', 'PlayerBlinded']);
    expect(events[2]).toMatchObject({ sec: wisp.behavior?.kind === 'spit' ? wisp.behavior.blindSec : 0 });
    // 致盲只是表現，不改權威狀態
    const after = applyEvents(s, events.slice(2), ctx);
    expect(after.player).toEqual(s.player);
  });
});
