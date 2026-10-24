import { describe, expect, it } from 'vitest';
import cameraBookmarks from '@/data/cameraBookmarks.json';
import { rebindableActions } from '@/game-core/input/actions';
import { itemCategories } from '@/game-core/items/items';
import { questCategories } from '@/game-core/quest/quest';
import { assetCategories } from '@/game-core/assets/packs';
import { netStatuses } from '@/net/netStore';
import { worldDataResult } from '@/game/worldData';
import zhTW from './zh-TW.json';

const dictionary: Record<string, string> = zhTW;

/** 資料檔裡所有 xxxKey / xxxKeys 欄位的文字 key */
function collectKeys(value: unknown, out: Set<string>, skip: ReadonlySet<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out, skip));
  else if (value && typeof value === 'object') {
    for (const [field, v] of Object.entries(value)) {
      if (!skip.has(field) && /Key$/.test(field) && typeof v === 'string') out.add(v);
      if (/Keys$/.test(field) && Array.isArray(v)) v.forEach((s) => typeof s === 'string' && out.add(s));
      collectKeys(v, out, skip);
    }
  }
  return out;
}

const dataFiles = import.meta.glob<{ default: unknown }>('../*.json', { eager: true });

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
      ...assetCategories.map((c) => `loading.category.${c}`),
    ];
    expect(keys.filter((key) => !(key in dictionary))).toEqual([]);
  });

  it('資料檔的每個文字 key（nameKey、textKey、speakerKey…）都有文字', () => {
    const missing = Object.entries(dataFiles).flatMap(([file, mod]) =>
      // 頭目的 textKey 是前綴（puffKing.intro…），下一項另外檢查
      [...collectKeys(mod.default, new Set(), file.endsWith('enemies.json') ? new Set(['textKey']) : undefined)].filter((key) => !(key in dictionary)).map((key) => `${file}: ${key}`),
    );
    expect(missing).toEqual([]);
  });

  it('每個頭目戰會用到的提示都有文字（頭目血條不會顯示 root.hint）', () => {
    if (!worldDataResult.ok) throw new Error(worldDataResult.error);
    const missing: string[] = [];
    for (const enemy of worldDataResult.data.combat.enemies.values()) {
      const boss = enemy.boss;
      if (!boss) continue;
      const names = ['intro', 'hint', 'phase2', 'retry', 'left', 'defeated'];
      if (boss.stun) names.push('stunned', 'mirrorEarly');
      if (boss.veil) names.push('veiled');
      if (boss.purify) names.push('purify');
      if (boss.mist) names.push('pillar');
      missing.push(...names.map((n) => `${boss.textKey}.${n}`).filter((key) => !(key in dictionary)));
      if (boss.troughs.length > 0) missing.push(...['boss.trough', 'boss.cleared', 'boss.shielded'].filter((key) => !(key in dictionary)));
    }
    expect(missing).toEqual([]);
  });
});
