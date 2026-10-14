// 任務 8C：水道謎題的水流計算。
import { describe, expect, it } from 'vitest';
import type { ObjectRuntime } from './types';
import { CHANNEL_LENGTH, CHANNEL_PATH, channelArc } from './glowmossTerrain';
import { outletsToWake, parseWaterways, waterwayFlow, type WaterwayDef } from './waterway';

const def: WaterwayDef = { id: 'w', blockers: ['roots', 'gate1', 'gate2', 'breach'], wheel: 'wheel', outlets: ['n1', 'n2', 'n3'] };

function objects(entries: Partial<ObjectRuntime & { id: string }>[]): Map<string, ObjectRuntime> {
  return new Map(entries.map(({ id, ...rt }) => [id!, { placementId: id!, ...rt }]));
}

describe('水流', () => {
  it('什麼都還沒做：水停在第一個阻擋點，沒有流到木輪', () => {
    expect(waterwayFlow(def, new Map())).toEqual({ cleared: 0, flowing: false, turn: 0, outlet: null });
  });

  it('依序排除：水流到下一個還沒排除的阻擋點；下游先打開也不算', () => {
    expect(waterwayFlow(def, objects([{ id: 'roots', active: true }])).cleared).toBe(1);
    expect(waterwayFlow(def, objects([{ id: 'gate1', active: true }, { id: 'gate2', active: true }])).cleared).toBe(0);
    expect(waterwayFlow(def, objects([{ id: 'roots', active: true }, { id: 'gate1', active: true }, { id: 'breach', repaired: true }])).cleared).toBe(2);
  });

  it('全部排除（樹根移開、閘門打開、渠段修好）後流到木輪目前指向的節點', () => {
    const all = [
      { id: 'roots', active: true },
      { id: 'gate1', active: true },
      { id: 'gate2', active: true },
      { id: 'breach', repaired: true },
    ];
    expect(waterwayFlow(def, objects(all))).toEqual({ cleared: 4, flowing: true, turn: 0, outlet: 'n1' });
    expect(waterwayFlow(def, objects([...all, { id: 'wheel', turn: 2 }])).outlet).toBe('n3');
    // 水正流向、還沒醒的節點才需要喚醒
    expect(outletsToWake([def], objects([...all, { id: 'wheel', turn: 1 }]))).toEqual(['n2']);
    expect(outletsToWake([def], objects([...all, { id: 'wheel', turn: 1 }, { id: 'n2', active: true }]))).toEqual([]);
    expect(outletsToWake([def], objects(all.slice(0, 3)))).toEqual([]);
  });

  it('資料驗證：參照的物件必須存在、id 不重複', () => {
    const ids = new Set(['roots', 'gate1', 'gate2', 'breach', 'wheel', 'n1', 'n2', 'n3']);
    expect(parseWaterways([def], ids)).toHaveLength(1);
    expect(() => parseWaterways([def], new Set([...ids].filter((i) => i !== 'n2')))).toThrow(/n2/);
    expect(() => parseWaterways([def, def], ids)).toThrow(/重複/);
  });
});

describe('渠道沿線距離', () => {
  it('泉眼為 0、終點為全長，中途的點依序遞增', () => {
    const [sx, sz] = CHANNEL_PATH[0]!;
    const [ex, ez] = CHANNEL_PATH[CHANNEL_PATH.length - 1]!;
    expect(channelArc(sx, sz)).toBeCloseTo(0);
    expect(channelArc(ex, ez)).toBeCloseTo(CHANNEL_LENGTH);
    const arcs = CHANNEL_PATH.map(([x, z]) => channelArc(x, z));
    for (let i = 1; i < arcs.length; i++) expect(arcs[i]!).toBeGreaterThan(arcs[i - 1]!);
    // 偏離中心線的點投影回中心線
    expect(channelArc(sx + 2, sz + 1)).toBeLessThan(3);
  });
});
