import type { CodexEntry } from '@/game-core/codex/codex';
import { combat } from './authority';
import { t } from './i18n';
import { worldDataResult } from './worldData';

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();

/** 圖鑑條目的名稱：生物用敵人名稱、素材用物品名稱、記錄用自己的標題（.title） */
export function codexName(entry: CodexEntry): string {
  const u = entry.unlock;
  if (u.type === 'encounter') return t(combat.enemies.get(u.enemy)?.nameKey ?? entry.textPrefix);
  if (u.type === 'item') return t(items.get(u.item)?.nameKey ?? entry.textPrefix);
  return t(`${entry.textPrefix}.title`);
}
