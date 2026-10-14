import { authority, worldIndex } from '../authority';
import { useCompanionBubble } from '../companion/companionRuntime';
import { useUiStore } from '../state/uiStore';
import { audio } from './audioEngine';
import type { SoundId } from './sounds';

/** 採集的聲音依物件種類：砍樹、敲石頭、摘花採藥 */
function harvestSound(placementId: string): SoundId {
  const placement = worldIndex.placement(placementId);
  const prefab = placement && worldIndex.prefab(placement.prefabId);
  if (prefab?.id.startsWith('tree')) return 'chop';
  if (prefab?.id.startsWith('rock')) return 'mine';
  return 'pick';
}

/** 權威層事件與 UI 互動 → 音效。只在啟動時安裝一次。 */
export function installAudioFeedback(): void {
  authority.subscribe((events) => {
    for (const e of events) {
      switch (e.type) {
        case 'ObjectHarvested':
          audio.play(harvestSound(e.placementId));
          break;
        case 'ItemsGained':
          if (e.source !== 'debug') audio.play('pickup');
          break;
        case 'ChestOpened':
          audio.play('chest');
          break;
        case 'QuestAccepted':
          audio.play('quest_accept');
          break;
        case 'QuestCompleted':
          audio.play('quest_complete');
          break;
        case 'ObjectRepaired':
          audio.play('repair');
          break;
        case 'ObjectActivated':
          audio.play(e.source === 'player' ? 'repair' : 'quest_accept');
          break;
        case 'ObjectTurned':
          audio.play('build');
          break;
        case 'BuildingPlaced':
          audio.play('build');
          break;
        case 'BuildingRemoved':
          audio.play('ui_back');
          break;
        case 'EnemyDamaged':
          audio.play('hit');
          break;
        case 'EnemyDefeated':
          audio.play('enemy_down');
          break;
        case 'PlayerDamaged':
          audio.play('hurt');
          break;
        case 'CompanionUnlocked':
          audio.sparkle();
          break;
        case 'CommandRejected':
          if (['inventory-full', 'missing-materials', 'quest-unavailable'].includes(e.reason)) audio.play('reject');
          break;
      }
    }
  });
  // 對話翻頁、露米說話
  useUiStore.subscribe((s, prev) => {
    if (s.dialogue && s.dialogue.nodeId !== prev.dialogue?.nodeId) audio.play('dialogue');
  });
  useCompanionBubble.subscribe((s, prev) => {
    if (s.text && s.id !== prev.id) audio.play('companion');
  });
  // 介面按鈕
  document.addEventListener(
    'click',
    (e) => {
      if (e.target instanceof Element && e.target.closest('button')) audio.play('ui_click');
    },
    true,
  );
}
