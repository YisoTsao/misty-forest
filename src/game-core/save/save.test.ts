import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameState } from '../authority/rules';
import { countItem } from '../inventory/inventory';
import { parseSettings } from '../settings/settingsData';
import { testContext } from '../testing/fixtures';
import { fromSaveData, toSaveData } from './convert';
import { loadWithFallback } from './load';
import { MemoryStorage } from './memoryStorage';
import { migrateSave, SaveFormatError, type Migration } from './migrate';
import { SAVE_VERSION, type SaveData } from './schema';

const ctx = testContext();
const player = { position: { x: 1.5, y: 0.9, z: -3 }, facingYaw: 0.7 };

/** 砍一棵樹、打開寶箱、時間前進 30 秒 */
function playedState(): GameState {
  let s = initialGameState();
  for (const cmd of [
    { type: 'HarvestObject', placementId: 't1' },
    { type: 'OpenChest', placementId: 'c1' },
    { type: 'AdvanceTime', dt: 30 },
  ] as const) {
    s = applyEvents(s, handleCommand(s, cmd, ctx), ctx);
  }
  return s;
}

const roundTrip = (data: unknown) => fromSaveData(JSON.parse(JSON.stringify(data)), ctx);

describe('存檔轉換', () => {
  it('存檔 → JSON → 讀回：世界物件差異、背包、時間、玩家位置一致', () => {
    const state = playedState();
    const data = toSaveData(state, player, new Date('2026-10-13T02:00:00Z'));
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.world.objects).toEqual([
      { placementId: 't1', harvested: true, respawnAt: 100 },
      { placementId: 'c1', open: true },
    ]);
    const loaded = roundTrip(data);
    expect(loaded.state.time).toBe(30);
    expect([...loaded.state.objects.values()]).toEqual([...state.objects.values()]);
    expect(loaded.state.inventory.slots).toEqual(state.inventory.slots);
    expect(loaded.player).toEqual(player);
    expect(loaded.savedAt).toBe('2026-10-13T02:00:00.000Z');
    expect(loaded.warnings).toEqual([]);
  });

  it('讀回的狀態可以繼續套用規則：已開的寶箱不能再開，樹會依存檔的時間重生', () => {
    const loaded = roundTrip(toSaveData(playedState(), player, new Date()));
    expect(handleCommand(loaded.state, { type: 'OpenChest', placementId: 'c1' }, ctx)[0]).toMatchObject({ reason: 'already-open' });
    const after = applyEvents(loaded.state, handleCommand(loaded.state, { type: 'AdvanceTime', dt: 70 }, ctx), ctx);
    expect(after.objects.has('t1')).toBe(false);
  });

  it('資料檔已移除的物件與物品被略過並回報，不讓整份存檔失效', () => {
    const data = toSaveData(playedState(), player, new Date()) as SaveData;
    data.world.objects.push({ placementId: 'removed_tree', harvested: true });
    data.inventory.slots[5] = { itemId: 'removed_item', count: 3 };
    const loaded = roundTrip(data);
    expect(loaded.state.objects.has('removed_tree')).toBe(false);
    expect(loaded.warnings).toHaveLength(2);
    expect(countItem(loaded.state.inventory, 'shard')).toBe(1);
  });

  it('格式錯誤時拋 SaveFormatError', () => {
    const good = toSaveData(playedState(), player, new Date());
    const bad = [
      null,
      [],
      { ...good, version: undefined },
      { ...good, player: { position: { x: 'a', y: 0, z: 0 }, facingYaw: 0 } },
      { ...good, world: { time: -1, objects: [] } },
      { ...good, inventory: { slots: [{ itemId: 'wood', count: 0 }] } },
    ];
    for (const raw of bad) expect(() => fromSaveData(raw, ctx)).toThrow(SaveFormatError);
  });
});

describe('版本遷移', () => {
  // 模擬三個版本的遷移鏈：v1 的 hp 改名為 health（v2），v2 補上 tutorial 旗標（v3）
  const migrations: Record<number, Migration> = {
    1: ({ hp, ...rest }) => ({ ...rest, health: hp }),
    2: (data) => ({ ...data, tutorial: { done: false } }),
  };

  it('依序套用遷移到最新版', () => {
    expect(migrateSave({ version: 1, hp: 5 }, migrations, 3)).toEqual({ version: 3, health: 5, tutorial: { done: false } });
    expect(migrateSave({ version: 2, health: 7 }, migrations, 3)).toEqual({ version: 3, health: 7, tutorial: { done: false } });
  });

  it('已是最新版時不變', () => {
    expect(migrateSave({ version: 3, health: 1 }, migrations, 3)).toEqual({ version: 3, health: 1 });
  });

  it('拒絕缺版本號、比遊戲新、缺少遷移函式的存檔', () => {
    expect(() => migrateSave({ hp: 1 }, migrations, 3)).toThrow(/版本號/);
    expect(() => migrateSave({ version: 4 }, migrations, 3)).toThrow(/比遊戲支援/);
    expect(() => migrateSave({ version: 1 }, { 2: migrations[2]! }, 3)).toThrow(/缺少版本 1/);
  });

  it('目前版本的每個舊版都有遷移函式', () => {
    // 真正的遷移鏈：從第 1 版升到目前版本不能中斷
    expect(() => migrateSave({ version: 1 })).not.toThrow(SaveFormatError);
  });
});

describe('loadWithFallback', () => {
  const parse = (raw: unknown) => fromSaveData(raw, ctx);
  const save = (n: number) => toSaveData({ ...initialGameState(), time: n }, player, new Date());

  it('沒有存檔', async () => {
    expect(await loadWithFallback(new MemoryStorage(), 'slot1', parse)).toEqual({ status: 'missing' });
  });

  it('主檔正常', async () => {
    const storage = new MemoryStorage();
    await storage.write('slot1', save(1));
    await storage.write('slot1', save(2));
    const outcome = await loadWithFallback(storage, 'slot1', parse);
    expect(outcome.status).toBe('ok');
    expect(outcome.status === 'ok' && outcome.value.state.time).toBe(2);
  });

  it('主檔 JSON 損壞 → 從備份還原', async () => {
    const storage = new MemoryStorage();
    await storage.write('slot1', save(1));
    await storage.write('slot1', save(2));
    storage.primary.set('slot1', '{"version": 1, 壞');
    const outcome = await loadWithFallback(storage, 'slot1', parse);
    expect(outcome.status).toBe('restored-from-backup');
    expect(outcome.status === 'restored-from-backup' && outcome.value.state.time).toBe(1);
  });

  it('主檔格式不符（zod 驗證失敗）→ 從備份還原', async () => {
    const storage = new MemoryStorage();
    await storage.write('slot1', save(1));
    await storage.write('slot1', { version: 1, junk: true });
    expect((await loadWithFallback(storage, 'slot1', parse)).status).toBe('restored-from-backup');
  });

  it('主檔與備份都損壞 → corrupt（附兩者原因），不拋錯', async () => {
    const storage = new MemoryStorage();
    storage.primary.set('slot1', 'not json');
    storage.backup.set('slot1', JSON.stringify({ version: 99 }));
    const outcome = await loadWithFallback(storage, 'slot1', parse);
    expect(outcome.status).toBe('corrupt');
    expect(outcome.status === 'corrupt' && outcome.backupError).toMatch(/比遊戲支援/);
  });

  it('主檔損壞且沒有備份 → corrupt', async () => {
    const storage = new MemoryStorage();
    storage.primary.set('slot1', '{');
    expect((await loadWithFallback(storage, 'slot1', parse)).status).toBe('corrupt');
  });

  it('匯出內容即主檔 JSON', async () => {
    const storage = new MemoryStorage();
    await storage.write('slot1', save(5));
    const text = await (await storage.export('slot1')).text();
    expect(JSON.parse(text)).toMatchObject({ version: SAVE_VERSION, world: { time: 5 } });
  });
});

describe('設定存檔', () => {
  it('接受合法設定，格式不符時回傳 null', () => {
    expect(parseSettings({ version: 1, quality: 'low' })).toEqual({ version: 1, quality: 'low' });
    expect(parseSettings({ version: 1, quality: 'ultra' })).toBeNull();
    expect(parseSettings(null)).toBeNull();
  });
});
