import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { isControllable } from '@/game-core/flow/gameFlow';
import { isTutorialStepComplete, type TutorialStep } from '@/game-core/tutorial/tutorial';
import { authority } from '@/game/authority';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { useUiStore } from '@/game/state/uiStore';

/** 檢查間隔（秒） */
const CHECK_INTERVAL = 0.2;

/**
 * 教學引導（規格 6.9）：每 0.2 秒檢查目前步驟是否完成，完成就送出指令讓權威層前進一步。
 * 移動距離從進入「移動」步驟時的位置算起（本機暫態，不存檔）。
 */
export function TutorialSystem() {
  const local = useMemo(() => ({ since: 0, step: null as TutorialStep | null, start: { x: 0, z: 0 } }), []);

  useFrame((_, dt) => {
    if (!isControllable(currentScreen())) return;
    local.since += dt;
    if (local.since < CHECK_INTERVAL) return;
    local.since = 0;

    const state = authority.getState();
    const { position } = playerRuntime;
    if (state.tutorial !== local.step) {
      local.step = state.tutorial;
      local.start = { x: position.x, z: position.z };
    }
    if (state.tutorial === 'done') return;

    let anyChestOpen = false;
    let anyHarvested = false;
    for (const o of state.objects.values()) {
      anyChestOpen ||= o.open === true;
      anyHarvested ||= o.harvested === true;
    }
    const complete = isTutorialStepComplete(state.tutorial, {
      movedDistance: Math.hypot(position.x - local.start.x, position.z - local.start.z),
      anyChestOpen,
      anyHarvested,
      inventoryOpened: useUiStore.getState().inventoryOpen,
    });
    if (complete) authority.send({ type: 'AdvanceTutorial', from: state.tutorial });
  });

  return null;
}
