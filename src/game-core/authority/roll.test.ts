// 第二章 Phase 3：翻滾閃避（規格 10.1）——翻滾中敵人的攻擊不扣血、有冷卻、倒下時不能翻滾；翻滾動作沿移動方向滾出去。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, ROLL_COOLDOWN_SEC, ROLL_SEC, type GameState } from './rules';
import type { LocomotionParams } from '../character/characterDef';
import { initialLocomotionState, ROLL_ANIM_SEC, ROLL_SPEED, stepLocomotion } from '../character/locomotion';
import { testContext } from '../testing/fixtures';
const ctx = testContext();
const at = (s: GameState, time: number): GameState => ({ ...s, time });
const roll = (s: GameState) => applyEvents(s, handleCommand(s, { type: 'Roll' }, ctx), ctx);

const p: LocomotionParams = { walkSpeed: 3, runSpeed: 6, acceleration: 20, deceleration: 20, turnSpeed: 10, gravity: 20, jumpVelocity: 8, coyoteTime: 0.1, fallDelay: 0.2, landDuration: 0.2 };

describe('翻滾閃避', () => {
  it('翻滾後無敵一段時間，之後冷卻中不能再翻滾', () => {
    const s0 = at(initialGameState(), 10);
    const s1 = roll(s0);
    expect(s1.player.rollUntil).toBeCloseTo(10 + ROLL_SEC);
    expect(s1.player.rollReadyAt).toBeCloseTo(10 + ROLL_COOLDOWN_SEC);
    const again = handleCommand(at(s1, 10.2), { type: 'Roll' }, ctx);
    expect(again).toEqual([{ type: 'CommandRejected', command: 'Roll', placementId: undefined, reason: 'cooldown' }]);
    expect(handleCommand(at(s1, 10 + ROLL_COOLDOWN_SEC + 0.01), { type: 'Roll' }, ctx).some((e) => e.type === 'PlayerRolled')).toBe(true);
  });

  it('倒下時不能翻滾', () => {
    const s = { ...at(initialGameState(), 5), player: { ...initialGameState().player, defeated: true, hp: 0 } };
    expect(handleCommand(s, { type: 'Roll' }, ctx)[0]).toMatchObject({ type: 'CommandRejected', reason: 'player-defeated' });
  });

  it('翻滾動作沿移動方向滾出去，翻滾中不受移動輸入影響，結束後恢復', () => {
    const def = p;
    let loco = initialLocomotionState(0);
    // 往 +X 方向按住，帶著翻滾請求
    const input = { right: 1, forward: 0, run: false, jumpPressed: false, roll: true };
    const first = stepLocomotion(loco, input, 0, true, def, 0.05);
    loco = first.state;
    expect(loco.vx).toBeCloseTo(ROLL_SPEED);
    expect(Math.abs(loco.vz)).toBeLessThan(1e-6);
    // 翻滾中放開移動鍵，速度仍維持
    for (let i = 0; i < 4; i++) loco = stepLocomotion(loco, { right: 0, forward: 0, run: false, jumpPressed: false }, 0, true, def, 0.05).state;
    expect(loco.vx).toBeCloseTo(ROLL_SPEED);
    // 超過動作時間後恢復正常（減速）
    for (let i = 0; i < 10; i++) loco = stepLocomotion(loco, { right: 0, forward: 0, run: false, jumpPressed: false }, 0, true, def, 0.05).state;
    expect(loco.rollTimer).toBe(0);
    expect(loco.vx).toBeLessThan(ROLL_SPEED);
    expect(ROLL_ANIM_SEC).toBeCloseTo(ROLL_SEC);
  });
});
