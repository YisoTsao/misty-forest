import { describe, expect, it } from 'vitest';
import cameraBookmarks from '@/data/cameraBookmarks.json';
import { rebindableActions } from '@/game-core/input/actions';
import { itemCategories } from '@/game-core/items/items';
import { questCategories } from '@/game-core/quest/quest';
import { netStatuses } from '@/net/netStore';
import zhTW from './zh-TW.json';

const dictionary: Record<string, string> = zhTW;

describe('i18n', () => {
  it('每個攝影機書籤都有顯示名稱（除錯面板不會顯示 bookmark.xxx）', () => {
    const missing = cameraBookmarks.map((b) => `bookmark.${b.id}`).filter((key) => !(key in dictionary));
    expect(missing).toEqual([]);
  });

  it('每個物品分類、任務分類、可設定的按鍵動作與連線狀態都有顯示名稱', () => {
    const keys = [
      ...itemCategories.map((c) => `inventory.category.${c}`),
      ...questCategories.map((c) => `journal.category.${c}`),
      ...rebindableActions.map((a) => `action.${a}`),
      ...netStatuses.map((s) => `net.status.${s}`),
    ];
    expect(keys.filter((key) => !(key in dictionary))).toEqual([]);
  });
});
