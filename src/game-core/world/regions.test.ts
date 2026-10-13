import { describe, expect, it } from 'vitest';
import regionsData from '@/data/regions.json';
import { initialMistStages, mistLevelAt, parseRegions, regionAt, type RegionDef } from './regions';
import { regionIds } from './types';

const regions: RegionDef[] = [
  { id: 'meadow', nameKey: 'region.meadow' },
  { id: 'forest', nameKey: 'region.forest', area: { center: [100, 0], radius: 20, blend: 10 } },
  { id: 'village', nameKey: 'region.village', area: { center: [-100, 0], radius: 10, blend: 4 } },
];
const stages = { ...initialMistStages, meadow: 'clear', forest: 'dense', village: 'light' } as const;

describe('regions', () => {
  it('專案的區域資料合法，涵蓋所有 regionId', () => {
    const parsed = parseRegions(regionsData);
    expect(parsed.map((r) => r.id).sort()).toEqual([...regionIds].sort());
  });

  it('重疊時取範圍較小、較具體的區域（湖心小島是家園，不是湖）', () => {
    const parsed = parseRegions(regionsData);
    expect(regionAt(parsed, 37.5, 8)).toBe('home');
    expect(regionAt(parsed, 26, 3)).toBe('lake');
  });

  it('區域內為該區域，範圍外為預設的草原', () => {
    expect(regionAt(regions, 100, 0)).toBe('forest');
    expect(regionAt(regions, 0, 0)).toBe('meadow');
    expect(regionAt(regions, -100, 5)).toBe('village');
  });

  it('迷霧：中心為該區域的值，範圍外為草原的值', () => {
    expect(mistLevelAt(regions, stages, 100, 0)).toBe(1);
    expect(mistLevelAt(regions, stages, -100, 0)).toBe(0.5);
    expect(mistLevelAt(regions, stages, 0, 0)).toBe(0);
  });

  it('邊界平滑過渡：從草原走向森林迷霧單調增加、沒有跳變', () => {
    let prev = 0;
    for (let x = 60; x <= 100; x += 0.5) {
      const m = mistLevelAt(regions, stages, x, 0);
      expect(m).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(m - prev).toBeLessThan(0.08);
      prev = m;
    }
    // 邊界中點約為一半
    expect(mistLevelAt(regions, stages, 80, 0)).toBeCloseTo(0.5, 1);
  });

  it('區域的迷霧改為清後，該區域與草原一樣晴朗', () => {
    expect(mistLevelAt(regions, { ...stages, forest: 'clear' }, 100, 0)).toBe(0);
  });
});
