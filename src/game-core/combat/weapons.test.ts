import { describe, expect, it } from 'vitest';
import weaponsData from '@/data/weapons.json';
import { assistFacing, createCombo, isInMoveArea, parseWeapons, startHeavy, startLight, weaponIds } from './weapons';

const catalog = parseWeapons(weaponsData);
const sword = catalog.weapons.get('sword')!;
const fist = catalog.weapons.get('fist')!;

describe('weapons data', () => {
  it('has fist, knife and sword, each with a light combo and a heavy attack', () => {
    for (const id of weaponIds) {
      const w = catalog.weapons.get(id)!;
      expect(w.light.length).toBeGreaterThanOrEqual(3);
      expect(w.heavy.cooldown).toBeGreaterThan(0);
      for (const m of [...w.light, w.heavy]) expect(m.hitDelay).toBeLessThan(m.duration);
    }
  });

  it('fist covers both punches and kicks (GAME_DESIGN 5.3)', () => {
    const clips = [...fist.light, fist.heavy].map((m) => m.clip);
    expect(clips.some((c) => c.includes('Punch'))).toBe(true);
    expect(clips.some((c) => c.includes('Kick'))).toBe(true);
  });

  it('rejects duplicated move ids', () => {
    const dup = structuredClone(weaponsData);
    dup[1]!.light[0]!.id = dup[0]!.light[0]!.id;
    expect(() => parseWeapons(dup)).toThrow(/招式 id 重複/);
  });

});

describe('combo', () => {
  it('chains light attacks inside the combo window and finishes with the last move', () => {
    let combo = createCombo('sword');
    const a = startLight(combo, sword, 0);
    expect(a.move.id).toBe('sword_slash_diag');
    combo = a.combo;
    const b = startLight(combo, sword, a.move.duration + 0.1);
    expect(b.move.id).toBe('sword_slash_flat');
    combo = b.combo;
    const c = startLight(combo, sword, a.move.duration + b.move.duration + 0.2);
    expect(c.move.id).toBe('sword_chop');
    expect(c.index).toBe(2);
    // 終結技之後回到第一招
    expect(startLight(c.combo, sword, 5).move.id).toBe('sword_slash_diag');
  });

  it('restarts from the first move after the window closes', () => {
    const a = startLight(createCombo('sword'), sword, 0);
    const late = a.move.duration + sword.comboWindow + 0.01;
    expect(startLight(a.combo, sword, late).move.id).toBe('sword_slash_diag');
  });

  it('switching weapon restarts the combo', () => {
    const a = startLight(createCombo('sword'), sword, 0);
    expect(startLight(a.combo, fist, 0.5).move.id).toBe('fist_punch_a');
  });

  it('heavy attack has a cooldown and resets the light combo', () => {
    const a = startLight(createCombo('sword'), sword, 0);
    const h = startHeavy(a.combo, sword, 0.6)!;
    expect(h.move.id).toBe('sword_whirlwind');
    expect(h.combo.next).toBe(0);
    expect(startHeavy(h.combo, sword, 0.6 + sword.heavy.cooldown - 0.01)).toBeNull();
    expect(startHeavy(h.combo, sword, 0.6 + sword.heavy.cooldown)).not.toBeNull();
  });
});

describe('hit area', () => {
  const player = { x: 0, z: 0, facingYaw: 0 }; // 面向 +Z
  const target = (x: number, z: number) => ({ x, z, radius: 0.5 });

  it('uses the move range and arc', () => {
    const stab = catalog.moves.get('knife_stab')!.move; // 窄扇形
    expect(isInMoveArea(stab, player, target(0, 2))).toBe(true);
    expect(isInMoveArea(stab, player, target(1.6, 1.2))).toBe(false);
    const flat = catalog.moves.get('sword_slash_flat')!.move; // 寬扇形
    expect(isInMoveArea(flat, player, target(1.6, 1.2))).toBe(true);
    expect(isInMoveArea(flat, player, target(0, -2))).toBe(false);
  });

  it('a 360° move hits behind the player', () => {
    const whirl = catalog.moves.get('sword_whirlwind')!.move;
    expect(isInMoveArea(whirl, player, target(0, -2.4))).toBe(true);
    expect(isInMoveArea(whirl, player, target(0, -3.5))).toBe(false);
  });

  it('always hits a target overlapping the player', () => {
    const stab = catalog.moves.get('knife_stab')!.move;
    expect(isInMoveArea(stab, player, target(0, -0.3))).toBe(true);
  });
});

describe('assistFacing', () => {
  it('turns toward the nearest enemy in front', () => {
    const yaw = assistFacing({ x: 0, z: 0, facingYaw: 0 }, [{ x: 1, z: 1.5 }, { x: -0.5, z: 2.8 }], 2);
    expect(yaw).toBeCloseTo(Math.atan2(1, 1.5));
  });

  it('ignores enemies behind or too far away', () => {
    expect(assistFacing({ x: 0, z: 0, facingYaw: 0 }, [{ x: 0, z: -1.5 }, { x: 0, z: 9 }], 2)).toBeNull();
  });
});
