import { describe, expect, it } from 'vitest';
import { isControllable, nextScreen } from './gameFlow';

describe('nextScreen', () => {
  it('主選單 → 開始 → 遊玩 → 暫停 → 回主選單 → 再開始（可連續遊玩並回主選單）', () => {
    let s = nextScreen('title', 'startGame');
    expect(s).toBe('playing');
    s = nextScreen(s, 'pause');
    expect(s).toBe('paused');
    s = nextScreen(s, 'returnToTitle');
    expect(s).toBe('title');
    expect(nextScreen(s, 'startGame')).toBe('playing');
  });

  it('暫停可切換、繼續', () => {
    expect(nextScreen('playing', 'togglePause')).toBe('paused');
    expect(nextScreen('paused', 'togglePause')).toBe('playing');
    expect(nextScreen('paused', 'resume')).toBe('playing');
  });

  it('不合法的轉換維持原狀', () => {
    expect(nextScreen('title', 'pause')).toBe('title');
    expect(nextScreen('title', 'togglePause')).toBe('title');
    expect(nextScreen('title', 'resume')).toBe('title');
    expect(nextScreen('playing', 'startGame')).toBe('playing');
    // 遊玩中不能直接回主選單（必須經過暫停選單）
    expect(nextScreen('playing', 'returnToTitle')).toBe('playing');
  });

  it('只有遊玩中可以操作角色', () => {
    expect(isControllable('playing')).toBe(true);
    expect(isControllable('paused')).toBe(false);
    expect(isControllable('title')).toBe(false);
  });
});
