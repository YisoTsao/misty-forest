import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { selectInteractTarget, type InteractCandidate } from '@/game-core/interaction/target';
import { isControllable } from '@/game-core/flow/gameFlow';
import { canInteract } from '@/game-core/world/objects';
import { input } from '@/game/input/inputManager';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { isModalOpen, useUiStore, type UiMessage } from '@/game/state/uiStore';
import { useWorldStore } from '@/game/state/worldStore';
import type { InteractableSpec, WorldIndex } from '@/game/world/worldIndex';

/** 互動目標的查詢半徑：需大於任何物件的 interactRadius */
const QUERY_RADIUS = 4;
/** 目標選擇間隔（秒）；按下 E 時會立即重新選擇 */
const SELECT_INTERVAL = 0.1;
/** 互動動作時間（秒），期間角色停止移動 */
const INTERACT_ACTION_SEC = 1.0;
/** 開箱後多久顯示訊息：讓玩家先看到掀蓋 */
const MESSAGE_DELAY_SEC = 0.9;

/**
 * 互動系統（規格 6.2）：靠近 → 提示 → E → 指令 → 事件 → 更新世界與 UI。
 * 以空間格網找附近候選，再由 game-core 選出最合適者，不對所有物件做射線檢測。
 * 提示目標只在改變時寫入 store。
 */
export function InteractionSystem({ index }: { index: WorldIndex }) {
  const scratch = useMemo(
    () => ({
      since: Infinity,
      nearby: [] as InteractableSpec[],
      candidates: [] as InteractCandidate[],
      pending: null as { message: UiMessage; delay: number } | null,
    }),
    [],
  );

  const selectTarget = (): InteractableSpec | null => {
    const { position, locomotion } = playerRuntime;
    const objects = useWorldStore.getState().objects;
    const nearby = index.interactables.query(position.x, position.z, QUERY_RADIUS, scratch.nearby);
    scratch.candidates.length = 0;
    for (const spec of nearby) {
      if (canInteract(spec.prefab, objects.get(spec.id))) scratch.candidates.push(spec);
    }
    const id = selectInteractTarget({ x: position.x, z: position.z, facingYaw: locomotion.facingYaw }, scratch.candidates);
    return id === null ? null : (nearby.find((s) => s.id === id) ?? null);
  };

  useFrame((_, dt) => {
    const ui = useUiStore.getState();
    const pressed = input.consumePressed('interact');
    // 主選單與暫停時不互動、不顯示提示（延遲中的訊息也一起停住）
    if (!isControllable(currentScreen())) {
      ui.setInteractTarget(null);
      return;
    }

    if (scratch.pending) {
      scratch.pending.delay -= dt;
      if (scratch.pending.delay <= 0) {
        ui.showMessage(scratch.pending.message);
        scratch.pending = null;
      }
      return;
    }

    // 視窗開啟時：E 關閉視窗，不觸發新的互動
    if (isModalOpen()) {
      if (pressed) ui.closeMessage();
      ui.setInteractTarget(null);
      return;
    }
    // 動作進行中或在空中時不顯示提示
    if (playerRuntime.action || !playerRuntime.locomotion.grounded) {
      ui.setInteractTarget(null);
      return;
    }

    scratch.since += dt;
    if (!pressed && scratch.since < SELECT_INTERVAL) return;
    scratch.since = 0;

    const target = selectTarget();
    const { interaction, nameKey } = target?.prefab ?? {};
    ui.setInteractTarget(target && interaction && nameKey ? { id: target.id, kind: interaction, nameKey } : null);
    if (!pressed || !target) return;

    const events = useWorldStore.getState().dispatch(index, { type: 'Interact', placementId: target.id });
    for (const e of events) {
      if (e.type === 'ChestOpened') {
        // 轉身面向寶箱再播放互動動畫
        const { position, locomotion } = playerRuntime;
        locomotion.facingYaw = Math.atan2(target.x - position.x, target.z - position.z);
        locomotion.vx = locomotion.vz = 0;
        playerRuntime.action = { clip: 'interact', remaining: INTERACT_ACTION_SEC };
        ui.setInteractTarget(null);
        scratch.pending = { message: { titleKey: 'chest.opened.title', bodyKey: 'chest.opened.body' }, delay: MESSAGE_DELAY_SEC };
      } else if (e.type === 'CommandRejected') {
        console.warn(`[interaction] 指令被拒絕：${e.placementId}（${e.reason}）`);
      }
    }
  });

  return null;
}
