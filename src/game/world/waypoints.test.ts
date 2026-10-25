// 星光路標（第二章檢討方案 C）：點亮後可以在同一張地圖上已點亮的路標之間傳送。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { canInteract } from '@/game-core/world/objects';
import { creekDistance, GLOWMOSS_ORIGIN, glowmossPathDistance } from '@/game-core/world/glowmossTerrain';
import { mapIdAt } from '@/game-core/world/maps';
import zhTW from '@/data/i18n/zh-TW.json';
import { waypointArrival, waypointDestinations, waypointNameKey, waypoints, WAYPOINT_ARRIVE_DISTANCE } from '@/game-core/world/waypoints';
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
const run = (s: GameState, cmd: GameCommand) => applyEvents(s, handleCommand(s, cmd, ctx), ctx);
const all = waypoints(data.placements, (id) => index.prefab(id));
const light = (s: GameState, id: string) => run(s, { type: 'ActivateObject', placementId: id });

describe('星光路標', () => {
  it('祕林各區都有一座，各有名稱（不重複），不在步道上、不在溪裡', () => {
    expect(all.map((w) => w.id)).toEqual(['waystone_arrival', 'waystone_garden', 'waystone_creek', 'waystone_village', 'waystone_grotto', 'waystone_deep', 'waystone_altar']);
    const names = all.map((w) => (zhTW as Record<string, string>)[waypointNameKey(w.id)]);
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(all.length);
    for (const w of all) {
      expect(mapIdAt(w.x, w.z), w.id).toBe('glowmoss');
      const lx = w.x - GLOWMOSS_ORIGIN.x;
      const lz = w.z - GLOWMOSS_ORIGIN.z;
      expect(glowmossPathDistance(lx, lz), w.id).toBeGreaterThan(2.4);
      expect(creekDistance(lx, lz), w.id).toBeGreaterThan(3);
    }
  });

  it('第一次互動點亮（不用材料）；點亮後仍可互動（打開傳送選單）', () => {
    const prefab = index.prefab('star_waystone')!;
    let s = initialGameState();
    expect(canInteract(prefab, s.objects.get('waystone_village'))).toBe(true);
    s = light(s, 'waystone_village');
    expect(s.objects.get('waystone_village')?.active).toBe(true);
    expect(canInteract(prefab, s.objects.get('waystone_village'))).toBe(true);
  });

  it('只能去其他已點亮的路標；自己的路標沒點亮時哪裡都不能去', () => {
    let s = initialGameState();
    expect(waypointDestinations(all, s.objects, 'waystone_village')).toEqual([]);
    s = light(s, 'waystone_village');
    expect(waypointDestinations(all, s.objects, 'waystone_village')).toEqual([]);
    s = light(light(s, 'waystone_creek'), 'waystone_altar');
    expect(waypointDestinations(all, s.objects, 'waystone_village').map((w) => w.id)).toEqual(['waystone_creek', 'waystone_altar']);
    expect(waypointDestinations(all, s.objects, 'waystone_garden')).toEqual([]);
  });

  it('抵達時站在路標正面、背對路標', () => {
    const placement = index.placement('waystone_village')!;
    const to = waypointArrival(placement);
    expect(Math.hypot(to.x - placement.position[0], to.z - placement.position[2])).toBeCloseTo(WAYPOINT_ARRIVE_DISTANCE);
    expect(to.yaw).toBeCloseTo(placement.rotation?.[1] ?? 0);
    // 聚落的路標面向步道（+X 方向）
    expect(to.x).toBeGreaterThan(placement.position[0]);
  });
});
