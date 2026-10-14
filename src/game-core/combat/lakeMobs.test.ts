// 任務 9B：澄鏡湖的三種怪物（Bible §7.6）——水泡精分裂、霧鷺影擲霧羽後瞬移、鏡殼蟹正面防禦與破綻；資料。
import { describe, expect, it } from 'vitest';
import enemiesData from '@/data/enemies.json';
import itemsData from '@/data/items.json';
import lootData from '@/data/lootTables.json';
import regionsData from '@/data/regions.json';
import spawnersData from '@/data/spawners.json';
import { applyEvents, handleCommand, initialGameState, type GameState } from '../authority/rules';
import { parseItemData } from '../items/items';
import { testContext } from '../testing/fixtures';
import { mapIdAt } from '../world/maps';
import { parseRegions, regionAt } from '../world/regions';
import { terrainHeight, WATER_LEVEL } from '../world/terrain';
import { parseCombatData, stanceDamageScale, type EnemyDef } from './combat';
import { aiStance, applyHitReaction, createEnemyAi, isInFront, stepEnemyAi, type EnemyAi } from './enemyAi';

const data = parseCombatData(enemiesData, spawnersData, new Set(lootData.map((t) => t.id)));
const wisp = data.enemies.get('mob_bubble_wisp')!;
const heron = data.enemies.get('mob_mist_heron')!;
const crab = data.enemies.get('mob_mirror_crab')!;
const itemData = parseItemData(itemsData, lootData);
const ctx = { ...testContext(), combat: data, items: itemData.items, lootTables: itemData.lootTables };
const home = { x: 0, z: 0, radius: 5 };
const random = () => 0.5;
const attack = 'sword_slash_diag';

function step(ai: EnemyAi, def: EnemyDef, player: { x: number; z: number }, dt = 0.05) {
  return stepEnemyAi(ai, def, { dt, player: { ...player, alive: true }, home, random });
}

function withEnemy(kind: string, hp: number, spawner = 'sp'): GameState {
  const s = initialGameState();
  return { ...s, enemies: new Map([['e1', { id: 'e1', kind, spawner, hp }]]) };
}

const amount = (events: ReturnType<typeof handleCommand>) => events.find((e) => e.type === 'EnemyDamaged')?.amount ?? NaN;

describe('水泡精：被打破時分裂成兩個小水滴', () => {
  it('擊敗時生成兩隻小水滴（id 接在後面、同一個生成點）；小水滴不會再分裂', () => {
    const events = handleCommand(withEnemy('mob_bubble_wisp', 1, 'mirrorlake_wisp_01'), { type: 'AttackEnemy', enemyId: 'e1', attack }, ctx);
    const spawned = events.filter((e) => e.type === 'EnemySpawned');
    expect(spawned).toEqual([
      { type: 'EnemySpawned', enemyId: 'e1~1', kind: 'mob_bubble_wisp_small', spawner: 'mirrorlake_wisp_01', hp: data.enemies.get('mob_bubble_wisp_small')!.maxHp },
      { type: 'EnemySpawned', enemyId: 'e1~2', kind: 'mob_bubble_wisp_small', spawner: 'mirrorlake_wisp_01', hp: data.enemies.get('mob_bubble_wisp_small')!.maxHp },
    ]);
    const after = applyEvents(withEnemy('mob_bubble_wisp', 1, 'mirrorlake_wisp_01'), events, ctx);
    expect([...after.enemies.keys()].sort()).toEqual(['e1~1', 'e1~2']);
    const small = handleCommand(after, { type: 'AttackEnemy', enemyId: 'e1~1', attack }, ctx);
    expect(small.some((e) => e.type === 'EnemyDefeated')).toBe(true);
    expect(small.some((e) => e.type === 'EnemySpawned')).toBe(false);
  });

  it('小水滴不佔生成點的數量：迷霧變淡、數量超過上限時只收回水泡精本身', () => {
    const spawner = data.spawners.find((s) => s.enemy === 'mob_bubble_wisp')!;
    let s = initialGameState();
    s = {
      ...s,
      mist: { ...s.mist, [spawner.regionId]: 'clear' },
      enemies: new Map([
        ['w1', { id: 'w1', kind: 'mob_bubble_wisp', spawner: spawner.id, hp: 30 }],
        ['w0~1', { id: 'w0~1', kind: 'mob_bubble_wisp_small', spawner: spawner.id, hp: 10 }],
      ]),
    };
    const events = handleCommand(s, { type: 'AdvanceTime', dt: 0.1 }, ctx);
    const despawned = events.filter((e) => e.type === 'EnemyDespawned').map((e) => (e as { enemyId: string }).enemyId);
    if (spawner.budget.clear === 0) expect(despawned).toEqual(['w1']);
    expect(despawned).not.toContain('w0~1');
  });

  it('分裂設定必須指向存在、而且不會再分裂的敵人', () => {
    const raw = enemiesData as unknown as EnemyDef[];
    const ids = new Set(lootData.map((t) => t.id));
    const loop = raw.map((e) => (e.id === 'mob_bubble_wisp_small' ? { ...e, splitInto: { enemy: 'mob_bubble_wisp_small', count: 2 } } : e));
    expect(() => parseCombatData(loop, spawnersData, ids)).toThrow(/不能再分裂|分裂/);
    const missing = raw.map((e) => (e.id === 'mob_bubble_wisp' ? { ...e, splitInto: { enemy: 'nope', count: 2 } } : e));
    expect(() => parseCombatData(missing, spawnersData, ids)).toThrow(/不存在/);
  });

  it('距離適中時噴水泡（緩速）', () => {
    const ai = createEnemyAi(0, 0);
    ai.state = 'chase';
    let spit: { x: number; z: number } | null = null;
    for (let t = 0; t < 3 && !spit; t += 0.05) spit = step(ai, wisp, { x: 5, z: 0 }).spit;
    expect(spit).toEqual({ x: 5, z: 0 });
    const events = handleCommand(withEnemy('mob_bubble_wisp', 30), { type: 'EnemyStrike', enemyId: 'e1', spit: true }, ctx);
    expect(events.some((e) => e.type === 'PlayerSlowed')).toBe(true);
  });
});

describe('霧鷺影：遠距離擲霧羽，擲完向後瞬移', () => {
  it('前搖後擲出霧羽，瞬移到離玩家更遠的地方，並回報瞬移前的位置', () => {
    const b = heron.behavior!;
    if (b.kind !== 'spit' || !b.retreat) throw new Error('behavior');
    const ai = createEnemyAi(0, 0);
    ai.state = 'chase';
    const player = { x: 7, z: 0 };
    let out = step(ai, heron, player);
    for (let t = 0; t < 3 && !out.spit; t += 0.05) out = step(ai, heron, player);
    expect(out.spit).toEqual(player);
    expect(out.blink).not.toBeNull();
    const before = Math.hypot(player.x - out.blink!.x, player.z - out.blink!.z);
    const after = Math.hypot(player.x - ai.x, player.z - ai.z);
    expect(after - before).toBeGreaterThan(b.retreat * 0.6);
    // 不會瞬移出巡邏範圍太遠
    expect(Math.hypot(ai.x - home.x, ai.z - home.z)).toBeLessThanOrEqual(heron.leashRadius);
  });

  it('沒有 retreat 的吐泥怪物不會瞬移', () => {
    const sprout = data.enemies.get('mob_mist_sprout')!;
    const ai = createEnemyAi(0, 0);
    ai.state = 'chase';
    for (let t = 0; t < 3; t += 0.05) expect(step(ai, sprout, { x: 6, z: 0 }).blink).toBeNull();
  });
});

describe('鏡殼蟹：正面防禦強，側面與出手後的破綻是弱點', () => {
  it('正面判定：面向兩側 arcDeg / 2 以內', () => {
    const b = crab.behavior!;
    if (b.kind !== 'carapace') throw new Error('behavior');
    const ai = createEnemyAi(0, 0, 0);
    expect(isInFront(ai, { x: 0, z: 2 }, b.arcDeg)).toBe(true);
    expect(isInFront(ai, { x: 2, z: 0 }, b.arcDeg)).toBe(false);
    expect(isInFront(ai, { x: 0, z: -2 }, b.arcDeg)).toBe(false);
  });

  it('姿態依攻擊者的方位：正面 guard、側面一般、破綻中 recover', () => {
    const ai = createEnemyAi(0, 0, 0);
    ai.state = 'chase';
    expect(aiStance(ai, crab, { x: 0, z: 2 })).toBe('guard');
    expect(aiStance(ai, crab, { x: 2, z: 0.2 })).toBeUndefined();
    ai.state = 'recover';
    expect(aiStance(ai, crab, { x: 0, z: 2 })).toBe('recover');
  });

  it('權威層：正面大幅減傷、破綻加傷', () => {
    expect(stanceDamageScale(crab, 'guard')).toBeLessThan(0.4);
    expect(stanceDamageScale(crab, 'recover')).toBeGreaterThan(1);
    const plain = handleCommand(withEnemy('mob_mirror_crab', 70), { type: 'AttackEnemy', enemyId: 'e1', attack }, ctx);
    const front = handleCommand(withEnemy('mob_mirror_crab', 70), { type: 'AttackEnemy', enemyId: 'e1', attack, stance: 'guard' }, ctx);
    const exposed = handleCommand(withEnemy('mob_mirror_crab', 70), { type: 'AttackEnemy', enemyId: 'e1', attack, stance: 'recover' }, ctx);
    expect(amount(front)).toBeLessThan(amount(plain));
    expect(amount(exposed)).toBeGreaterThan(amount(plain));
  });

  it('出手後進入破綻，時間到恢復；正面被打幾乎推不動、不會被打斷', () => {
    const b = crab.behavior!;
    if (b.kind !== 'carapace') throw new Error('behavior');
    const ai = createEnemyAi(0, 0, Math.PI / 2);
    ai.state = 'chase';
    let struck = false;
    for (let t = 0; t < 3 && !struck; t += 0.05) struck = step(ai, crab, { x: 1.4, z: 0 }).strike;
    expect(struck).toBe(true);
    expect(ai.state).toBe('recover');
    for (let t = 0; t < b.recoverSec + 0.1; t += 0.05) step(ai, crab, { x: 1.4, z: 0 });
    expect(ai.state).not.toBe('recover');
    const front = createEnemyAi(0, 0, 0);
    front.state = 'attack';
    applyHitReaction(front, { x: 0, z: 2 }, 6, crab);
    expect(front.state).toBe('attack');
    expect(Math.hypot(front.knockback.x, front.knockback.z)).toBeLessThan(1.5);
  });
});

describe('澄鏡湖的怪物資料', () => {
  const regions = parseRegions(regionsData);
  it('三種湖區怪物都有生成點，在澄鏡湖的岸上、區域一致', () => {
    for (const kind of ['mob_bubble_wisp', 'mob_mist_heron', 'mob_mirror_crab']) {
      const lake = data.spawners.filter((s) => s.enemy === kind && mapIdAt(s.center[0], s.center[1]) === 'mirrorlake');
      expect(lake.length, kind).toBeGreaterThanOrEqual(2);
      for (const s of lake) {
        expect(regionAt(regions, s.center[0], s.center[1]), s.id).toBe(s.regionId);
        expect(terrainHeight(s.center[0], s.center[1]), s.id).toBeGreaterThan(WATER_LEVEL + 0.3);
      }
    }
  });

  it('掉落依 Bible：水泡精湖珠 55%、水之精華 25%；霧鷺影霧羽 60%、星光碎屑 15%；鏡殼蟹鏡殼片 65%、湖珠 20%', () => {
    const table = (id: string) => lootData.find((t) => t.id === id)!.drops;
    const has = (itemId: string, chance: number) => expect.objectContaining({ itemId, chance });
    expect(table(wisp.lootTableId!)).toEqual(expect.arrayContaining([has('lake_pearl', 0.55), has('water_essence', 0.25)]));
    expect(table(heron.lootTableId!)).toEqual(expect.arrayContaining([has('mist_feather', 0.6), has('starlight_shard', 0.15)]));
    expect(table(crab.lootTableId!)).toEqual(expect.arrayContaining([has('mirror_shell', 0.65), has('lake_pearl', 0.2)]));
  });
});
