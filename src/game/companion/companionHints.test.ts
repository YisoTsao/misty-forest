// 芽芽的提示資料（2026-10-24）：用專案的任務資料確認各階段挑到的提示。
// 提示是「第一個符合的勝出」：clear_forest 是燈塔任務的前置，原本 buildCottage / chapterEnd 排在前面，
// 燈塔之後的噗啾王、送信、第二章的提示全部被擋住。
import { describe, expect, it } from 'vitest';
import { initialGameState, type GameState } from '@/game-core/authority/rules';
import { pickCompanionHint } from '@/game-core/companion/companion';
import { worldDataResult } from '../worldData';

if (!worldDataResult.ok) throw new Error(worldDataResult.error);
const data = worldDataResult.data;
const ctx = { quests: data.quests };

/** 第一章主線到燈塔都完成 */
const CHAPTER1 = ['quest_dawn_001', 'wood_for_bridge', 'repair_bridge', 'clear_forest', 'quest_dawn_003'];
const MAIN2 = ['quest_forest_001', 'quest_forest_002', 'quest_forest_003', 'quest_forest_004', 'quest_forest_005', 'quest_forest_006', 'quest_forest_007', 'quest_forest_008'];

function stateWith(completed: readonly string[], active: readonly string[] = [], bosses: readonly string[] = []): GameState {
  const s = initialGameState();
  const quests = Object.fromEntries([...completed.map((id) => [id, { status: 'completed' as const }]), ...active.map((id) => [id, { status: 'active' as const }])]);
  return { ...s, tutorial: 'done', quests, defeatedBosses: bosses };
}
const hint = (s: GameState) => pickCompanionHint(data.companion, s, ctx);

describe('芽芽的提示', () => {
  it('燈塔之後不再被「蓋小木屋」擋住：先提噗啾王之前的第二章入口', () => {
    expect(hint(stateWith(CHAPTER1))).toBe('companion.hint.ch2.f1Offer');
  });

  it('進行中的故事任務優先於可以接的主線', () => {
    expect(hint(stateWith(CHAPTER1, ['quest_dawn_004']))).toBe('companion.hint.dawn4');
  });

  it('第二章每個任務進行中都有自己的提示', () => {
    const all = [...data.quests.keys()].filter((id) => id.startsWith('quest_forest_'));
    expect(all.length).toBe(14);
    for (const id of all) {
      const done = [...CHAPTER1, ...data.quests.get(id)!.requires];
      // 前置任務本身的前置也算完成（主線依序）
      const mainBefore = MAIN2.slice(0, Math.max(0, ...done.map((q) => MAIN2.indexOf(q) + 1)));
      const key = hint(stateWith([...new Set([...done, ...mainBefore])], [id]));
      expect(key, id).toMatch(/^companion\.hint\.ch2\./);
    }
  });

  it('主線之間（例如回報完燈柱、還沒找菇菇婆婆）提示去聚落', () => {
    expect(hint(stateWith([...CHAPTER1, 'quest_forest_001']))).toBe('companion.hint.ch2.grannyOffer');
  });

  it('第二章結束：噗啾王還沒打時提噗啾王，打完後提澄鏡湖', () => {
    expect(hint(stateWith([...CHAPTER1, ...MAIN2]))).toBe('companion.hint.puffKing');
    expect(hint(stateWith([...CHAPTER1, ...MAIN2], [], ['boss_dawn_mist_puff']))).toBe('companion.hint.ch2.end');
  });
});
