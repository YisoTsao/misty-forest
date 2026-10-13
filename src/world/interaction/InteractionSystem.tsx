import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { GameCommand } from '@/game-core/authority/rules';
import { isControllable } from '@/game-core/flow/gameFlow';
import { selectInteractTarget, type InteractCandidate } from '@/game-core/interaction/target';
import { canInteract } from '@/game-core/world/objects';
import type { Prefab } from '@/game-core/world/types';
import { authority } from '@/game/authority';
import { input } from '@/game/input/inputManager';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { isModalOpen, useUiStore, type UiMessage } from '@/game/state/uiStore';
import type { InteractableSpec, WorldIndex } from '@/game/world/worldIndex';

/** 互動目標的查詢半徑：需大於任何物件的 interactRadius */
const QUERY_RADIUS = 4;
/** 目標選擇間隔（秒）；按下 E 時會立即重新選擇 */
const SELECT_INTERVAL = 0.1;
/** 互動動作時間（秒），期間角色停止移動 */
const ACTION_SEC = { interact: 1.0, attack: 0.95 } as const;
/** 動作開始後多久送出指令（揮下 / 伸手的瞬間），採集物在這時消失 */
const COMMAND_DELAY_SEC = { interact: 0.45, attack: 0.5 } as const;
/** 開箱後多久顯示訊息：讓玩家先看到掀蓋 */
const MESSAGE_DELAY_SEC = 0.6;

type Pending = { delay: number } & ({ kind: 'command'; command: GameCommand } | { kind: 'message'; message: UiMessage });

function commandFor(prefab: Prefab, placementId: string): GameCommand | null {
  switch (prefab.interaction) {
    case 'harvest':
      return { type: 'HarvestObject', placementId };
    case 'open':
      return { type: 'OpenChest', placementId };
    default:
      return null;
  }
}

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
      pending: [] as Pending[],
    }),
    [],
  );

  // 開箱成功後顯示紙條（等蓋子掀開）
  useEffect(
    () =>
      authority.subscribe((events) => {
        if (events.some((e) => e.type === 'ChestOpened')) {
          scratch.pending.push({ kind: 'message', delay: MESSAGE_DELAY_SEC, message: { titleKey: 'chest.opened.title', bodyKey: 'chest.opened.body' } });
        }
      }),
    [scratch],
  );

  const selectTarget = (): InteractableSpec | null => {
    const { position, locomotion } = playerRuntime;
    const objects = useGameStateStore.getState().state.objects;
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
    // 主選單與暫停時不互動、不顯示提示（延遲中的指令與訊息也一起停住）
    if (!isControllable(currentScreen())) {
      ui.setInteractTarget(null);
      if (currentScreen() === 'title') scratch.pending.length = 0;
      return;
    }

    if (scratch.pending.length > 0) {
      for (const p of scratch.pending) p.delay -= dt;
      const due = scratch.pending.filter((p) => p.delay <= 0);
      scratch.pending = scratch.pending.filter((p) => p.delay > 0);
      for (const p of due) {
        if (p.kind === 'command') authority.send(p.command);
        else ui.showMessage(p.message);
      }
      if (scratch.pending.length > 0) return;
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
    const command = commandFor(target.prefab, target.id);
    if (!command) return;

    // 轉身面向目標、播放動作，在揮下 / 伸手的瞬間送出指令（結果由權威層的事件決定）
    const clip = target.prefab.harvest?.anim ?? 'interact';
    const { position, locomotion } = playerRuntime;
    locomotion.facingYaw = Math.atan2(target.x - position.x, target.z - position.z);
    locomotion.vx = locomotion.vz = 0;
    playerRuntime.action = { clip, remaining: ACTION_SEC[clip] };
    ui.setInteractTarget(null);
    scratch.pending.push({ kind: 'command', command, delay: COMMAND_DELAY_SEC[clip] });
  });

  return null;
}
