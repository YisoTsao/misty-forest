import { describe, expect, it } from 'vitest';
import { selectInteractTarget } from './target';

// facingYaw 0 = 面向 +Z
const player = { x: 0, z: 0, facingYaw: 0 };

describe('selectInteractTarget', () => {
  it('範圍外的候選不會被選中', () => {
    expect(selectInteractTarget(player, [{ id: 'far', x: 0, z: 3, radius: 2 }])).toBeNull();
    expect(selectInteractTarget(player, [])).toBeNull();
  });

  it('選擇最近的候選', () => {
    const pick = selectInteractTarget(player, [
      { id: 'a', x: 0, z: 1.5, radius: 2 },
      { id: 'b', x: 0, z: 0.8, radius: 2 },
    ]);
    expect(pick).toBe('b');
  });

  it('距離相近時，面前的目標優先於背後的目標', () => {
    const pick = selectInteractTarget(player, [
      { id: 'behind', x: 0, z: -1.0, radius: 2 },
      { id: 'front', x: 0, z: 1.2, radius: 2 },
    ]);
    expect(pick).toBe('front');
  });

  it('背後的目標如果明顯更近仍可選中（不會完全看不到）', () => {
    const pick = selectInteractTarget(player, [
      { id: 'behind', x: 0, z: -0.3, radius: 2 },
      { id: 'front', x: 0, z: 1.9, radius: 2 },
    ]);
    expect(pick).toBe('behind');
  });

  it('面向會隨 facingYaw 改變', () => {
    const candidates = [
      { id: 'east', x: 1, z: 0, radius: 2 },
      { id: 'west', x: -1, z: 0, radius: 2 },
    ];
    expect(selectInteractTarget({ ...player, facingYaw: Math.PI / 2 }, candidates)).toBe('east');
    expect(selectInteractTarget({ ...player, facingYaw: -Math.PI / 2 }, candidates)).toBe('west');
  });
});
