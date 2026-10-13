import { advanceDialogue, pickDialogue, viewNode, type DialogueView } from '@/game-core/dialogue/dialogue';
import { authority, dialogues, npcs } from './authority';
import { npcRuntime } from './npc/npcRuntime';
import { useUiStore } from './state/uiStore';

// 對話流程（規格 6.4）：開始 → 逐節點前進 / 選擇 → 結束。只在本機 UI 進行，狀態只讀權威層。

/** 與 NPC 開始對話；沒有符合條件的對話時回傳 false */
export function startTalk(npcId: string): boolean {
  const npc = npcs.find((n) => n.id === npcId);
  if (!npc) throw new Error(`未知的 NPC：${npcId}`);
  const dialogueId = pickDialogue(npc.talk, authority.getState());
  const def = dialogueId ? dialogues.get(dialogueId) : undefined;
  if (!def) return false;
  const runtime = npcRuntime.get(npcId);
  if (runtime) runtime.talking = true;
  useUiStore.getState().setDialogue({ npcId, dialogueId: def.id, nodeId: def.start });
  return true;
}

/** 目前顯示的對話節點 */
export function currentDialogueView(): DialogueView | null {
  const active = useUiStore.getState().dialogue;
  const def = active && dialogues.get(active.dialogueId);
  return active && def ? viewNode(def, active.nodeId, authority.getState()) : null;
}

/** 繼續（沒有選項的節點）或選擇選項（optionIndex 為節點內的原始索引） */
export function advanceTalk(optionIndex?: number): void {
  const ui = useUiStore.getState();
  const active = ui.dialogue;
  const def = active && dialogues.get(active.dialogueId);
  if (!active || !def) return;
  const { next } = advanceDialogue(def, active.nodeId, authority.getState(), optionIndex);
  if (next) ui.setDialogue({ ...active, nodeId: next });
  else endTalk();
}

export function endTalk(): void {
  const ui = useUiStore.getState();
  const active = ui.dialogue;
  if (!active) return;
  const runtime = npcRuntime.get(active.npcId);
  if (runtime) runtime.talking = false;
  ui.setDialogue(null);
}
