import { describe, expect, it } from 'vitest';
import companionData from '@/data/companion.json';
import keybindings from '@/data/keybindings.json';
import { initialGameState } from '../authority/rules';
import { parseBindings, parseSavedBindings } from '../input/actions';
import { testContext } from '../testing/fixtures';
import { parseCompanion, pickCompanionHint, type CompanionDef } from './companion';

const def: CompanionDef = {
  nameKey: 'c',
  hints: [
    { when: { type: 'questReady', quest: 'gather' }, textKey: 'ready' },
    { when: { type: 'questStatus', quest: 'gather', is: 'active' }, textKey: 'active' },
    { textKey: 'default' },
  ],
};
const cctx = { quests: testContext().quests };

describe('星光夥伴', () => {
  it('專案的提示資料合法', () => {
    expect(parseCompanion(companionData).hints.length).toBeGreaterThan(3);
  });

  it('最後一個提示必須是沒有條件的預設提示', () => {
    expect(() => parseCompanion({ nameKey: 'c', hints: [{ when: { type: 'tutorialDone' }, textKey: 'x' }] })).toThrow(/預設/);
  });

  it('依任務進度挑選第一個符合的提示', () => {
    const s = initialGameState();
    expect(pickCompanionHint(def, s, cctx)).toBe('default');
    const active = { ...s, quests: { gather: { status: 'active' as const } } };
    expect(pickCompanionHint(def, active, cctx)).toBe('active');
  });
});

describe('parseSavedBindings', () => {
  const defaults = parseBindings(keybindings);
  it('舊設定缺少新加入的動作時以預設補上，保留玩家改過的按鍵', () => {
    const old: Record<string, string[]> = { ...defaults, interact: ['KeyF'] };
    delete old.companion;
    const merged = parseSavedBindings(old, defaults);
    expect(merged?.interact).toEqual(['KeyF']);
    expect(merged?.companion).toEqual(['KeyH']);
  });
  it('格式不符時回傳 null', () => {
    expect(parseSavedBindings('nope', defaults)).toBeNull();
    expect(parseSavedBindings({ jump: 'Space' }, defaults)).toBeNull();
  });
});
