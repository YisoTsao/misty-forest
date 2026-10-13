import { describe, expect, it } from 'vitest';
import interiorsData from '@/data/interiors.json';
import placements from '@/data/placements.json';
import prefabs from '@/data/prefabs.json';
import { interiorAt, parseInteriors } from './interiors';
import { parseWorldData } from './worldData';

const tavern = {
  id: 'tavern',
  nameKey: 'object.tavern',
  origin: [1000, 1000],
  door: 'door_1',
  inside: [1000, 1003, Math.PI],
  outsideDistance: 4.6,
  light: [1004, 2, 996],
};
const ids = new Set(['door_1']);

describe('parseInteriors', () => {
  it('專案的室內資料合法，入口都存在', () => {
    const map = parseInteriors(interiorsData, new Set(placements.map((p) => p.id)));
    expect(map.get('tavern')?.door).toBe('village_tavern_03');
  });

  it('拒絕不存在的入口、重複 id 與保留字 overworld', () => {
    expect(() => parseInteriors([{ ...tavern, door: 'missing' }], ids)).toThrow(/missing/);
    expect(() => parseInteriors([tavern, tavern], ids)).toThrow(/重複/);
    expect(() => parseInteriors([{ ...tavern, id: 'overworld' }], ids)).toThrow(/overworld/);
  });

  it('室內的出入口 prefab 必須提供 enter 設定', () => {
    const door = { id: 'door', model: 'procedural:door_mat', collider: 'none', interaction: 'enter', nameKey: 'object.tavern', persists: false };
    expect(() => parseWorldData([door], [])).toThrow(/enter/);
    expect(parseWorldData([{ ...door, enter: { to: 'tavern' } }], []).prefabs.get('door')?.enter?.to).toBe('tavern');
  });
});

describe('interiorAt', () => {
  const map = parseInteriors([tavern], ids);
  it('室內原點附近才算在室內，開放世界不算', () => {
    expect(interiorAt(map, 1003, 1002)?.id).toBe('tavern');
    expect(interiorAt(map, 0, 0)).toBeNull();
    expect(interiorAt(map, -7, -30)).toBeNull();
  });

  it('室內子場景遠離開放世界所有物件（不與開放世界混用）', () => {
    const world = parseWorldData(prefabs, placements);
    const map = parseInteriors(interiorsData, new Set(world.placements.map((p) => p.id)));
    const roomIds = new Set(placements.filter((p) => p.id.startsWith('tavern_')).map((p) => p.id));
    for (const p of world.placements) {
      const inside = interiorAt(map, p.position[0], p.position[2]) !== null;
      expect(inside, p.id).toBe(roomIds.has(p.id));
    }
  });
});
