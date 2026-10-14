import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { GameCommand } from '@/game-core/authority/rules';
import { isControllable } from '@/game-core/flow/gameFlow';
import { selectInteractTarget, type InteractCandidate } from '@/game-core/interaction/target';
import { canInteract } from '@/game-core/world/objects';
import type { Prefab } from '@/game-core/world/types';
import { authority, npcs, quests } from '@/game/authority';
import { questStatus } from '@/game-core/quest/quest';
import { startTalk } from '@/game/dialogueController';
import { travel, travelToMap } from '@/game/location';
import { isGateOpen } from '@/game-core/world/gates';
import { isMapId } from '@/game-core/world/maps';
import { audio } from '@/game/audio/audioEngine';
import { input } from '@/game/input/inputManager';
import { npcRuntime, npcVisible } from '@/game/npc/npcRuntime';
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

/** 互動目標：世界物件（placement）或 NPC */
type Target = { kind: 'object'; spec: InteractableSpec } | { kind: 'npc'; id: string; nameKey: string; x: number; z: number };

const NPC_PREFIX = 'npc:';

function commandFor(prefab: Prefab, placementId: string): GameCommand | null {
  switch (prefab.interaction) {
    case 'harvest':
      return { type: 'HarvestObject', placementId };
    case 'open':
      return { type: 'OpenChest', placementId };
    case 'repair':
      return { type: 'RepairObject', placementId };
    case 'activate':
      return { type: 'ActivateObject', placementId };
    case 'turn':
      return { type: 'TurnObject', placementId };
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

  const selectTarget = (): Target | null => {
    const { position, locomotion } = playerRuntime;
    const state = useGameStateStore.getState().state;
    const isQuestActive = (id: string) => {
      const def = quests.get(id);
      return def !== undefined && questStatus(state, def) === 'active';
    };
    const nearby = index.interactables.query(position.x, position.z, QUERY_RADIUS, scratch.nearby);
    scratch.candidates.length = 0;
    for (const spec of nearby) {
      if (canInteract(spec.prefab, state.objects.get(spec.id), isQuestActive)) scratch.candidates.push(spec);
    }
    // NPC 會移動，不放進靜態格網；數量少，直接逐一檢查
    for (const npc of npcs) {
      if (!npcVisible(npc, state)) continue;
      const rt = npcRuntime.get(npc.id);
      if (rt) scratch.candidates.push({ id: NPC_PREFIX + npc.id, x: rt.x, z: rt.z, radius: npc.interactRadius });
    }
    const id = selectInteractTarget({ x: position.x, z: position.z, facingYaw: locomotion.facingYaw }, scratch.candidates);
    if (id === null) return null;
    if (id.startsWith(NPC_PREFIX)) {
      const npc = npcs.find((n) => NPC_PREFIX + n.id === id);
      const rt = npc && npcRuntime.get(npc.id);
      return npc && rt ? { kind: 'npc', id: npc.id, nameKey: npc.nameKey, x: rt.x, z: rt.z } : null;
    }
    const spec = nearby.find((s) => s.id === id);
    return spec ? { kind: 'object', spec } : null;
  };

  useFrame((_, dt) => {
    const ui = useUiStore.getState();
    // 建造模式中互動鍵用來放置（BuildController），不觸發互動
    if (ui.build) {
      ui.setInteractTarget(null);
      return;
    }
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
    if (target?.kind === 'npc') {
      ui.setInteractTarget({ id: NPC_PREFIX + target.id, kind: 'talk', nameKey: target.nameKey });
    } else {
      const { interaction, nameKey, verbKey } = target?.spec.prefab ?? {};
      ui.setInteractTarget(target && interaction && nameKey ? { id: target.spec.id, kind: interaction, nameKey, verbKey } : null);
    }
    if (!pressed || !target) return;

    const { position, locomotion } = playerRuntime;
    const tx = target.kind === 'npc' ? target.x : target.spec.x;
    const tz = target.kind === 'npc' ? target.z : target.spec.z;
    locomotion.facingYaw = Math.atan2(tx - position.x, tz - position.z);
    locomotion.vx = locomotion.vz = 0;
    if (target.kind === 'npc') {
      // 對話（規格 6.4）：對話視窗開啟後由 DialogueBox 處理按鍵
      ui.setInteractTarget(null);
      if (document.pointerLockElement) document.exitPointerLock();
      startTalk(target.id);
      return;
    }
    // 出入口（規格 5.2：門與入口 → 場景切換）：本機轉場，不經過權威層
    const enter = target.spec.prefab.enter;
    if (enter) {
      ui.setInteractTarget(null);
      // 條件未達成時說明原因（Bible §3.2：不用看不出原因的封鎖）；地圖出入口（任務 8A）與室內（任務 7M 燈塔地窖）都一樣
      const gameState = authority.getState();
      if (!isGateOpen(enter, gameState.quests, gameState.time)) {
        if (document.pointerLockElement) document.exitPointerLock();
        ui.showMessage({ titleKey: target.spec.prefab.nameKey ?? 'object.gateGlowmoss', bodyKey: enter.lockedKey ?? 'gate.locked' });
        audio.play('reject');
        return;
      }
      if (isMapId(enter.to)) {
        travelToMap(enter.to, enter.arriveAt ?? '', enter.arriveDistance ?? 4);
        return;
      }
      travel(enter.to);
      return;
    }
    // 告示牌 / 路標：顯示內容（本機，不改變世界狀態）
    if (target.spec.prefab.read) {
      ui.setInteractTarget(null);
      if (document.pointerLockElement) document.exitPointerLock();
      ui.showMessage(target.spec.prefab.read);
      return;
    }
    const command = commandFor(target.spec.prefab, target.spec.id);
    if (!command) return;

    // 播放動作，在揮下 / 伸手的瞬間送出指令（結果由權威層的事件決定）
    const clip = target.spec.prefab.harvest?.anim ?? target.spec.prefab.activate?.anim ?? 'interact';
    playerRuntime.action = { clip, remaining: ACTION_SEC[clip] };
    ui.setInteractTarget(null);
    scratch.pending.push({ kind: 'command', command, delay: COMMAND_DELAY_SEC[clip] });
  });

  return null;
}
