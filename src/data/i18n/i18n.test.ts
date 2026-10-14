import { describe, expect, it } from 'vitest';
import cameraBookmarks from '@/data/cameraBookmarks.json';
import zhTW from './zh-TW.json';

const dictionary: Record<string, string> = zhTW;

describe('i18n', () => {
  it('每個攝影機書籤都有顯示名稱（除錯面板不會顯示 bookmark.xxx）', () => {
    const missing = cameraBookmarks.map((b) => `bookmark.${b.id}`).filter((key) => !(key in dictionary));
    expect(missing).toEqual([]);
  });
});
