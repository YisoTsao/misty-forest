import type { GameEvent } from '@/game-core/authority/rules';
import { authority, quests } from './authority';
import { t } from './i18n';
import { worldDataResult } from './worldData';
import { useUiStore } from './state/uiStore';

const rejectMessageKeys: Partial<Record<Extract<GameEvent, { type: 'CommandRejected' }>['reason'], string>> = {
  'inventory-full': 'toast.inventoryFull',
};

function itemName(itemId: string): string {
  const def = worldDataResult.ok ? worldDataResult.data.items.get(itemId) : undefined;
  return def ? t(def.nameKey) : itemId;
}

/** 把權威層事件轉成玩家看得到的回饋（取得物品、背包已滿）。只在啟動時安裝一次。 */
export function installEventFeedback(): void {
  authority.subscribe((events) => {
    const ui = useUiStore.getState();
    for (const e of events) {
      if (e.type === 'ItemsGained') {
        for (const stack of e.items) ui.pushToast({ itemId: stack.itemId, count: stack.count });
      } else if (e.type === 'ItemsRemoved') {
        for (const stack of e.items) ui.pushToast({ textKey: 'toast.itemsGiven', vars: { item: itemName(stack.itemId), count: stack.count } });
      } else if (e.type === 'QuestAccepted' || e.type === 'QuestCompleted') {
        const def = quests.get(e.quest);
        const key = e.type === 'QuestAccepted' ? 'toast.questAccepted' : 'toast.questCompleted';
        ui.pushToast({ textKey: key, vars: { name: def ? t(def.nameKey) : e.quest } });
      } else if (e.type === 'CommandRejected') {
        const key = rejectMessageKeys[e.reason];
        if (key) ui.pushToast({ textKey: key });
        else console.warn(`[authority] 指令被拒絕：${e.command} ${e.placementId ?? ''}（${e.reason}）`);
      }
    }
  });
}
