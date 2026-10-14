import type { GameEvent } from '@/game-core/authority/rules';
import { authority, quests, worldIndex } from './authority';
import { t } from './i18n';
import { worldDataResult } from './worldData';
import { useUiStore } from './state/uiStore';

const rejectMessageKeys: Partial<Record<Extract<GameEvent, { type: 'CommandRejected' }>['reason'], string>> = {
  'inventory-full': 'toast.inventoryFull',
  'quest-unavailable': 'toast.questLocked',
  'not-in-fight': 'toast.troughIdle',
  'boss-not-defeated': 'toast.guardianAwake',
  'out-of-order': 'toast.notYet',
  'not-enough-coins': 'toast.notEnoughCoins',
  'hp-full': 'toast.hpFull',
  'not-usable': 'toast.notUsable',
  'recipe-locked': 'toast.recipeLocked',
  'too-soon': 'toast.tooSoon',
  'not-for-sale': 'toast.notForSale',
};

function itemName(itemId: string): string {
  const def = worldDataResult.ok ? worldDataResult.data.items.get(itemId) : undefined;
  return def ? t(def.nameKey) : itemId;
}

function objectNameKey(placementId: string): string | undefined {
  const placement = worldIndex.placement(placementId);
  return placement && worldIndex.prefab(placement.prefabId)?.nameKey;
}

/** 把權威層事件轉成玩家看得到的回饋（取得物品、背包已滿）。只在啟動時安裝一次。 */
export function installEventFeedback(): void {
  authority.subscribe((events) => {
    const ui = useUiStore.getState();
    for (const e of events) {
      if (e.type === 'ItemsGained') {
        for (const stack of e.items) ui.pushToast({ itemId: stack.itemId, count: stack.count });
      } else if (e.type === 'MistStageChanged') {
        ui.pushToast({ textKey: `toast.mist.${e.stage}`, vars: { region: t(`region.${e.region}`) } });
      } else if (e.type === 'ObjectRepaired') {
        const nameKey = objectNameKey(e.placementId);
        ui.pushToast(nameKey === 'object.bridge' || !nameKey ? { textKey: 'toast.bridgeRepaired' } : { textKey: 'toast.objectRepaired', vars: { name: t(nameKey) } });
      } else if (e.type === 'ObjectActivated' && e.source === 'water') {
        ui.pushToast({ textKey: 'toast.mossAwake' });
      } else if (e.type === 'ObjectActivated' && e.source === 'quest') {
        const nameKey = objectNameKey(e.placementId);
        if (nameKey) ui.pushToast({ textKey: 'toast.objectReleased', vars: { name: t(nameKey) } });
      } else if (e.type === 'ObjectTurned') {
        // 星光鏡（任務 7E）的提示由頭目戰處理
        if (objectNameKey(e.placementId) === 'object.waterWheel') ui.pushToast({ textKey: 'toast.wheelTurned' });
      } else if (e.type === 'ItemsRemoved') {
        // 喝藥不顯示「交出」（體力條本身就會變化）
        if (e.reason === 'use' || e.reason === 'craft') continue;
        const key = e.reason === 'shop' ? 'toast.paid' : 'toast.itemsGiven';
        for (const stack of e.items) ui.pushToast({ textKey: key, vars: { item: itemName(stack.itemId), count: stack.count } });
      } else if (e.type === 'QuestAccepted' || e.type === 'QuestCompleted') {
        const def = quests.get(e.quest);
        const key = e.type === 'QuestAccepted' ? 'toast.questAccepted' : 'toast.questCompleted';
        ui.pushToast({ textKey: key, vars: { name: def ? t(def.nameKey) : e.quest } });
      } else if (e.type === 'CommandRejected' && e.reason === 'missing-materials' && e.placementId) {
        // 列出需要的材料
        const placement = worldIndex.placement(e.placementId);
        const materials = (placement && worldIndex.prefab(placement.prefabId)?.repair?.materials) ?? [];
        ui.pushToast({ textKey: 'toast.missingMaterials', vars: { materials: materials.map((m) => `${itemName(m.itemId)} ×${m.count}`).join('、') } });
      } else if (e.type === 'CommandRejected') {
        const key = rejectMessageKeys[e.reason];
        if (key) ui.pushToast({ textKey: key });
        else console.warn(`[authority] 指令被拒絕：${e.command} ${e.placementId ?? ''}（${e.reason}）`);
      }
    }
  });
}
