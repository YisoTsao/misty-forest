import type { GameEvent } from '@/game-core/authority/rules';
import { authority } from './authority';
import { useUiStore } from './state/uiStore';

const rejectMessageKeys: Partial<Record<Extract<GameEvent, { type: 'CommandRejected' }>['reason'], string>> = {
  'inventory-full': 'toast.inventoryFull',
};

/** 把權威層事件轉成玩家看得到的回饋（取得物品、背包已滿）。只在啟動時安裝一次。 */
export function installEventFeedback(): void {
  authority.subscribe((events) => {
    const ui = useUiStore.getState();
    for (const e of events) {
      if (e.type === 'ItemsGained') {
        for (const stack of e.items) ui.pushToast({ itemId: stack.itemId, count: stack.count });
      } else if (e.type === 'CommandRejected') {
        const key = rejectMessageKeys[e.reason];
        if (key) ui.pushToast({ textKey: key });
        else console.warn(`[authority] 指令被拒絕：${e.command} ${e.placementId ?? ''}（${e.reason}）`);
      }
    }
  });
}
