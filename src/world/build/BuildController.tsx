import { useFrame } from '@react-three/fiber';
import { placementProblem, snapToGrid, BUILD_ROTATE_STEP } from '@/game-core/build/build';
import { isControllable } from '@/game-core/flow/gameFlow';
import { regionAt } from '@/game-core/world/regions';
import { authority, buildables, regions, worldIndex } from '@/game/authority';
import { buildRuntime } from '@/game/build/buildRuntime';
import { input } from '@/game/input/inputManager';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { isModalOpen, useUiStore } from '@/game/state/uiStore';

/** 預覽放在玩家面前：佔地半徑 + 這個距離 */
const AHEAD = 1.1;
/** 玩家身體半徑（預覽與玩家重疊時不能放） */
const PLAYER_RADIUS = 0.35;

/**
 * 建造模式（規格 6.7）：只在湖心小島「旅人小屋」可用。建造鍵開關選單；選好後預覽跟著玩家面前移動、
 * 吸附網格，旋轉鍵轉 45°，互動鍵或左鍵確認。放置檢查與權威層相同，確認後才扣材料。
 */
export function BuildController() {
  useFrame(() => {
    const ui = useUiStore.getState();
    const screen = currentScreen();
    if (!isControllable(screen)) {
      if (screen === 'title' && ui.build) ui.setBuild(null);
      return;
    }
    const inHome = regionAt(regions, playerRuntime.position.x, playerRuntime.position.z) === 'home';
    const buildPressed = input.consumePressed('build');

    if (!ui.build) {
      if (!buildPressed) return;
      if (!inHome) {
        ui.pushToast({ textKey: 'build.onlyHome' });
        return;
      }
      if (isModalOpen() || authority.getState().player.defeated) return;
      ui.setBuild({ menu: true, selected: null });
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }

    // 離開小島、倒下或其他視窗開啟時離開建造模式
    if (!inHome || authority.getState().player.defeated || ui.dialogue || ui.inventoryOpen || ui.message) {
      ui.setBuild(null);
      return;
    }
    if (buildPressed) {
      ui.setBuild({ ...ui.build, menu: !ui.build.menu });
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    if (ui.build.menu || !ui.build.selected) return;
    const def = buildables.get(ui.build.selected);
    if (!def) return;

    if (input.consumePressed('rotate')) buildRuntime.yaw = (buildRuntime.yaw + BUILD_ROTATE_STEP) % (Math.PI * 2);
    const { position, locomotion } = playerRuntime;
    const dist = def.footprint + AHEAD;
    buildRuntime.x = snapToGrid(position.x + Math.sin(locomotion.facingYaw) * dist);
    buildRuntime.z = snapToGrid(position.z + Math.cos(locomotion.facingYaw) * dist);
    buildRuntime.ready = true;
    const state = authority.getState();
    buildRuntime.problem =
      Math.hypot(buildRuntime.x - position.x, buildRuntime.z - position.z) < def.footprint + PLAYER_RADIUS
        ? 'player'
        : placementProblem(def, buildRuntime, state.buildings, buildables, state.inventory, (x, z, m) => worldIndex.isOccupied(x, z, m));

    const confirm = input.consumePressed('interact') || input.consumePressed('attack');
    if (confirm && buildRuntime.problem === null) {
      authority.send({ type: 'PlaceBuilding', buildable: def.id, x: buildRuntime.x, z: buildRuntime.z, yaw: buildRuntime.yaw });
    }
  });
  return null;
}
