import { describe, expect, it } from 'vitest';
import landmarksData from '@/data/landmarks.json';
import { initialGameState } from '../authority/rules';
import { worldBoundaryDistance } from '../world/maps';
import { testContext } from '../testing/fixtures';
import { clampToRadius, parseLandmarks, questMarkers } from './markers';

const ctx = testContext();
const npcAt: Record<string, { x: number; z: number }> = { npc_a: { x: -17, z: -45 } };
const markerCtx = {
  npcPosition: (id: string) => npcAt[id] ?? null,
  placement: (id: string) => ctx.world.placement(id),
  spawners: ctx.combat.spawners,
};

describe('地標資料', () => {
  it('專案的地標合法、id 不重複，且都在可玩範圍內', () => {
    const list = parseLandmarks(landmarksData);
    expect(list.length).toBeGreaterThan(10);
    for (const l of list) expect(worldBoundaryDistance(l.position[0], l.position[1]), l.id).toBeGreaterThan(0);
  });

  it('id 重複或圖示未知時拒絕', () => {
    const one = { id: 'a', nameKey: 'x', icon: 'village', position: [0, 0] };
    expect(() => parseLandmarks([one, one])).toThrow();
    expect(() => parseLandmarks([{ ...one, icon: 'castle' }])).toThrow();
  });
});

describe('questMarkers', () => {
  it('新遊戲：可以接的任務標在委託人身上', () => {
    const state = initialGameState();
    const markers = questMarkers(state, ctx.quests, markerCtx);
    const available = markers.filter((m) => m.kind === 'available');
    expect(available.length).toBeGreaterThan(0);
    for (const m of available) {
      const giver = ctx.quests.get(m.questId)!.giver;
      expect({ x: m.x, z: m.z }).toEqual(npcAt[giver]);
    }
  });

  it('進行中的擊敗任務標出敵人的生成區域；修理任務標出要修的物件', () => {
    for (const q of ctx.quests.values()) {
      const state = { ...initialGameState(), quests: { ...Object.fromEntries(q.requires.map((r) => [r, { status: 'completed' as const }])), [q.id]: { status: 'active' as const } } };
      const markers = questMarkers(state, ctx.quests, markerCtx).filter((m) => m.questId === q.id);
      for (const o of q.objectives) {
        if (o.type === 'defeat') {
          const areas = ctx.combat.spawners.filter((s) => s.enemy === o.enemy);
          expect(markers.filter((m) => m.kind === 'objective' && m.radius !== undefined)).toHaveLength(areas.length);
        }
        if (o.type === 'repair') {
          const p = ctx.world.placement(o.placementId)!;
          expect(markers).toContainEqual({ questId: q.id, kind: 'objective', x: p.position[0], z: p.position[2] });
        }
      }
    }
  });

  it('完成的任務沒有標記；委託人找不到位置時不標', () => {
    const done = Object.fromEntries([...ctx.quests.keys()].map((id) => [id, { status: 'completed' as const }]));
    expect(questMarkers({ ...initialGameState(), quests: done }, ctx.quests, markerCtx)).toEqual([]);
    expect(questMarkers(initialGameState(), ctx.quests, { ...markerCtx, npcPosition: () => null })).toEqual([]);
  });
});

describe('clampToRadius', () => {
  it('範圍內不變，範圍外夾到圓周上', () => {
    expect(clampToRadius(3, 4, 10)).toEqual({ dx: 3, dz: 4, clamped: false });
    const c = clampToRadius(30, 40, 10);
    expect(c.clamped).toBe(true);
    expect(Math.hypot(c.dx, c.dz)).toBeCloseTo(10);
    expect(c.dx / c.dz).toBeCloseTo(0.75);
  });
});
