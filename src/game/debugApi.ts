import { windowGlowStats, windowGlowUniforms } from '@/render/windowGlow';
import { growthStage } from '@/game-core/build/build';
import { exploredRatio, isExploredAt } from '@/game-core/map/explore';
import type { BossMoveId } from '@/game-core/combat/combat';
import { bossDebug, bossDebugState } from './combat/bossRuntime';
import { setWorldMapOpen } from '@/ui/map/WorldMap';
import { currentQuestMarkers } from '@/ui/map/mapDraw';
import { requiredClipKeys, type ClipKey } from '@/game-core/character/characterDef';
import type { FlowAction, GameScreen } from '@/game-core/flow/gameFlow';
import { parseMistLevel, type MistStage } from '@/game-core/world/mist';
import { objectiveProgress, questStatus } from '@/game-core/quest/quest';
import { regionAt } from '@/game-core/world/regions';
import { mapIdAt, worldBoundaryDistance, type MapId } from '@/game-core/world/maps';
import { timePhase, type CelestialPosition, type TimePhase } from '@/game-core/world/timeOfDay';
import type { WeaponId } from '@/game-core/combat/weapons';
import type { RegionId } from '@/game-core/world/types';
import { initialGameState, type GameCommand } from '@/game-core/authority/rules';
import { countItem, type InventorySlot } from '@/game-core/inventory/inventory';
import type { ObjectRuntime } from '@/game-core/world/types';
import { MAIN_SLOT } from '@/game-core/save/schema';
import { audio } from './audio/audioEngine';
import { authority, buildables, lightPaths, quests, regions, waterways, worldIndex } from './authority';
import { traceLight } from '@/game-core/world/lightPath';
import { lightPathRuntime } from './world/lightPathRuntime';
import { waterwayFlow } from '@/game-core/world/waterway';
import { waterwayRuntime } from './world/waterwayRuntime';
import { getCharacterDef, PLAYER_CHARACTER_ID } from './character/characters';
import { buildRuntime } from './build/buildRuntime';
import { attackEnemy, combatRuntime, enemyRuntime, enemyY } from './combat/combatRuntime';
import { companionRuntime } from './companion/companionRuntime';
import { ambientRuntime } from './ambient/ambientRuntime';
import { useInputDeviceStore } from './input/device';
import { input } from './input/inputManager';
import { currentMap, mapGateTo, travelToMap, useLocationStore } from './location';
import { npcRuntime } from './npc/npcRuntime';
import { lighthouseVisual } from './world/lighthouseRuntime';
import { perfStats } from './perfStats';
import { cameraRuntime, playerRuntime } from './player/localRuntime';
import { useDebugStore, type CameraMode } from './state/debugStore';
import { saveGame } from './save/saveService';
import { saveStorage } from './save/storages';
import { useGameStore } from './state/gameStore';
import { useSettingsStore } from './state/settingsStore';
import { useUiStore } from './state/uiStore';
import { boundaryRuntime } from './world/boundaryRuntime';
import { timeRuntime, updateTimeRuntime } from './world/timeRuntime';
import { spellRuntime } from './combat/spellRuntime';
import { vfxStats } from './vfx/vfxQueue';
import { mistRuntime } from './world/mistRuntime';
import { mistTargetAt } from './world/mistTarget';
import { cameraBookmarks } from './worldData';
import { connect, disconnect, reconnect, sendRaw } from '@/net/netClient';
import { chatRuntime, useChatStore } from '@/net/chatStore';
import { remotePose, remoteRuntime, useNetStore, type NetStatus } from '@/net/netStore';

export type MistwoodDebugApi = {
  isReady: () => boolean;
  bookmarks: () => string[];
  setBookmark: (id: string) => void;
  /** 自由視角：攝影機放在 position 看向 target */
  viewAt: (position: [number, number, number], target: [number, number, number]) => void;
  setCameraMode: (mode: CameraMode) => void;
  /** 規格 4.6 要求的動畫鍵 */
  animKeys: () => readonly string[];
  /** 讓玩家角色停在指定動畫的某個時間比例（0–1）；傳 null 恢復正常。 */
  previewAnimation: (key: string | null, fraction?: number) => void;
  /** 以動畫片段名稱定格（近戰招式的截圖檢查，GAME_DESIGN 5.3） */
  previewClip: (clip: string, fraction: number) => void;
  /** 裝備近戰武器（經權威層指令） */
  equip: (weapon: WeaponId) => void;
  /** 唯讀快照：端對端測試用 */
  playerState: () => {
    x: number;
    y: number;
    z: number;
    anim: string;
    grounded: boolean;
    speed: number;
    facingYaw: number;
    action: string | null;
    respawnCount: number;
  };
  /** 移動玩家；feetY 省略時腳底貼齊地形 */
  teleport: (x: number, z: number, feetY?: number) => void;
  /** 跟隨相機目前的角度與距離 */
  cameraAngles: () => { yaw: number; pitch: number; distance: number };
  /** 設定跟隨相機的角度與距離（省略的欄位不變），回傳目前相機位置 */
  camera: (set?: { yaw?: number; pitch?: number; distance?: number }) => { x: number; y: number; z: number };
  /** 覆寫畫面迷霧（0–1）；null 回到依區域迷霧。instant 預設 true（截圖用，不漸變） */
  setMist: (value: number | null, instant?: boolean) => void;
  /** 目前畫面上的迷霧值、目標值（依玩家位置）與覆寫值 */
  mist: () => { current: number; target: number; override: number | null };
  /** 設定區域的迷霧階段（權威狀態，經除錯指令） */
  setMistStage: (region: RegionId, stage: MistStage) => void;
  /** 各區域的迷霧階段 */
  mistStages: () => Record<RegionId, MistStage>;
  /** 世界地圖（任務 7B）：已探索比例、某處是否已探索、整張地圖標為已探索、開關地圖、目前的任務標記 */
  /** 某張地圖已探索的比例（省略時為所在地圖） */
  mapExplored: (map?: MapId) => number;
  /** 所在地圖（依玩家位置）與畫面顯示中的地圖 */
  currentMap: () => { at: MapId; shown: MapId };
  /** 走過地圖出入口（不檢查通過條件），抵達對面出入口前方 */
  travelToMap: (map: MapId) => void;
  isExplored: (x: number, z: number) => boolean;
  revealMap: () => void;
  setMapOpen: (open: boolean) => void;
  questMarkers: () => { questId: string; kind: string; x: number; z: number }[];
  /** 玩家目前所在區域 */
  region: () => RegionId;
  /** 近戰（GAME_DESIGN 5.3）：裝備、手上顯示的武器、連段、重擊冷卻、目前的招式動畫 */
  melee: () => { weapon: string; shown: string | null; comboCount: number; heavyCooldown: number; actionClip: string | null; hitStop: number; trail: number };
  /** 魔法（GAME_DESIGN 5.4）：星光值、各法術冷卻、施法中、飛行中的彈體、施放與命中次數、特效系統狀態 */
  magic: () => {
    mp: number;
    cooldowns: Record<string, number>;
    casting: string | null;
    released: boolean;
    projectiles: number;
    casts: number;
    hits: number;
    vfx: { capacity: number; emitted: number; alive: number; circles: number; shockwaves: number; lights: number };
  };
  /** 直接設定星光值（經權威層除錯指令） */
  setMp: (mp: number) => void;
  /** 清除所有法術冷卻（截圖與測試用） */
  resetSpellCooldowns: () => void;
  /** 日夜（GAME_DESIGN 5.2）：遊玩秒數、時鐘、第幾天、時段、方向光是否為月亮、強度、日月位置、畫面使用的時段 */
  clock: () => {
    time: number;
    hour: number;
    day: number;
    phase: TimePhase;
    moonLight: boolean;
    lightIntensity: number;
    sun: CelestialPosition;
    moon: CelestialPosition;
    lookHour: number;
    night: number;
  };
  /** 時間往前推進到指定時刻（0–24，經權威層除錯指令；只往前） */
  setClock: (hour: number) => void;
  /** 地圖邊界：玩家到邊界的距離（界內為正）、是否在提示範圍、提示次數、碰撞體數量 */
  boundary: () => { distance: number; near: boolean; warnings: number; colliders: number };
  /** 目前顯示互動提示的物件 id */
  interactTarget: () => string | null;
  objectState: (placementId: string) => ObjectRuntime | null;
  /** 權威狀態回到新遊戲（端對端測試用） */
  resetWorld: () => void;
  /** 背包格子快照 */
  inventory: () => InventorySlot[];
  itemCount: (itemId: string) => number;
  /** 敵人是否還在權威狀態裡；enemyAnim 為模型怪物目前播放的動畫（含正在倒下消失的） */
  enemyKnown: (id: string) => boolean;
  enemyAnim: (id: string) => string | null;
  /** 遊戲時間（秒） */
  gameTime: () => number;
  /** 直接送出指令給權威層（測試用，例如快轉時間驗證重生） */
  send: (command: GameCommand) => void;
  /** 立即存檔（等同暫停選單的「儲存遊戲」），回傳是否成功 */
  saveNow: () => Promise<boolean>;
  /** 匯出主存檔的內容（JSON 字串） */
  exportSave: () => Promise<string>;
  /** 目前的設定值 */
  settings: () => { quality: string; volumes: { master: number; music: number; sfx: number } };
  /** NPC 目前的位置與狀態 */
  npcState: (id: string) => { x: number; z: number; yaw: number; walking: boolean; talking: boolean } | null;
  /** 任務狀態（locked / available / active / completed） */
  questState: (id: string) => string;
  /** 直接把任務設為已完成（不給獎勵；測試地圖出入口的條件用） */
  setQuestCompleted: (id: string) => void;
  /** 任務第一個目標的進度 */
  questProgress: (id: string) => number;
  /** 水鏡光路（任務 9D）：被光照到的鏡子數、是否照到閘門、場景上畫出的光束數 */
  lightPath: () => { lit: number; solved: boolean; beams: number };
  /** 任務每個目標的進度（任務 8C） */
  questObjectives: (id: string) => { current: number; target: number }[];
  /** 水道謎題（任務 8C）：權威狀態算出的水流，與畫面上水面推進到哪裡 */
  /** 頭目戰（任務 8D）：目前的狀態（沒有開戰時 null） */
  boss: () => ReturnType<typeof bossDebug>;
  /** 頭目的下一招指定為某一招 */
  forceBossMove: (move: BossMoveId) => void;
  defeatedBosses: () => readonly string[];
  /** 晨曦燈塔的光柱是否已建立（任務 7D） */
  lighthouseBeam: () => boolean;
  /** 讓玩家被緩速（測試用，任務 7I） */
  slowPlayer: (sec: number, scale: number) => void;
  /** 直接打開商店 / 工作台（截圖用，任務 7H、7J） */
  openShop: (shop: string) => void;
  openCraft: (station: string) => void;
  /** 村屋窗燈（任務 7N）：目前亮度、加上窗燈的材質數、已編譯的數量 */
  windowGlow: () => { glow: number; patched: number; compiled: number };
  /** 建造物目前的成長階段（任務 7K 花圃；不會長大的為 0） */
  buildingStage: (id: string) => number | null;
  waterway: () => { cleared: number; flowing: boolean; turn: number; outlet: string | null; channelReach: number; flumeReach: number[]; rotorAngle: number; spoutYaw: number } | null;
  /** 畫面上的迷霧生物（位置、AI 狀態、權威層的血量） */
  enemies: () => { id: string; kind: string; x: number; y: number; z: number; yaw: number; state: string; hp: number; anim: string | null }[];
  /** 以玩家的招式打敵人（附上敵人目前的姿態，與實際出招相同；任務 8B 甲蟲縮殼） */
  hitEnemy: (id: string, attack: string) => void;
  /** 玩家的緩速（迷霧芽怪的泥團） */
  playerSlow: () => { remaining: number; scale: number };
  /** 和平模式：迷霧生物不追擊、不攻擊（截圖與測試用） */
  setPeaceful: (peaceful: boolean) => void;
  /** 星光夥伴：是否解鎖、目前位置 */
  companion: () => { unlocked: boolean; x: number; y: number; z: number };
  /** 建造模式與預覽 */
  buildState: () => { mode: { menu: boolean; selected: string | null } | null; ghost: { x: number; z: number; yaw: number; problem: string | null } };
  /** 已放置的建造物 */
  buildings: () => { id: string; buildable: string; x: number; z: number; yaw: number }[];
  /** 音效狀態：AudioContext、各音效播放次數、音樂是否播放、鳥叫強度 */
  audio: () => { state: string; played: Record<string, number>; music: boolean; birds: number; crickets: number };
  /** 目前所在的場景（overworld 或室內 id） */
  location: () => string;
  /** 羊群：每隻羊的位置與狀態、整群是否暫停（玩家太遠） */
  flock: (id: string) => { paused: boolean; sheep: { x: number; z: number; mode: string }[] } | null;
  /** 模擬手把狀態（buttons 0–1、axes -1–1，standard mapping）；null 還原為實體手把 */
  setPad: (pad: { buttons?: number[]; axes?: number[] } | null) => void;
  /** 最近使用的輸入裝置 */
  inputDevice: () => string;
  /** 目前手把選取的按鈕文字（選單導覽） */
  padFocus: () => string | null;
  /** 模擬按一下按鍵代碼（例如 Mouse0），經過按鍵綁定 */
  tap: (code: string) => void;
  /** 讓玩家面向某個位置 */
  face: (x: number, z: number) => void;
  /** 玩家戰鬥狀態 */
  combatState: () => { hp: number; defeated: boolean; attackCooldown: number; skillCooldown: number };
  /** 進行中的對話 */
  dialogue: () => { npcId: string; dialogueId: string; nodeId: string } | null;
  /** 目前畫面上的通知 */
  toasts: () => { itemId?: string; count?: number; textKey?: string }[];
  activeColliders: () => number;
  /** 效能量測數據快照（scripts/perf.mjs 使用） */
  perf: () => typeof perfStats & { jsHeapMB: number | null };
  /** 送出遊戲流程動作（主選單 / 暫停），回傳切換後的畫面 */
  flow: (action: FlowAction) => GameScreen;
  /** 多人連線（任務 11A）：連線狀態、人數、被伺服器修正的次數 */
  net: () => { status: NetStatus; playerCount: number; roomId: string | null; sessionId: string | null; playerId: string | null; error: string | null; corrections: number; lastCorrection: string | null; actionsSent: number; actionsReceived: number; actionsPlayed: number };
  /** 遠端玩家：伺服器最新位置（x/y/z）、畫面上插值後的位置（rx/ry/rz）、是否顯示在目前的地圖、是否在線（斷線中為 false）、目前的呈現延遲（毫秒） */
  remotePlayers: () => { sessionId: string; name: string; x: number; y: number; z: number; rx: number; ry: number; rz: number; anim: string; map: string; location: string; visible: boolean; online: boolean; delayMs: number; weapon: string; clip: string | null; held: string | null }[];
  netConnect: (options?: { name?: string; url?: string }) => Promise<boolean>;
  netDisconnect: () => Promise<void>;
  netReconnect: () => Promise<boolean>;
  /** 送任意訊息給伺服器（驗證伺服器會拒絕不合法的內容） */
  netSendRaw: (type: string, payload: unknown) => boolean;
  /** 聊天（任務 11F）：輸入列是否開著、目前頻道、紀錄（系統訊息以 key 表示）、正在顯示的泡泡 */
  chat: () => {
    open: boolean;
    channel: string;
    lines: { channel: string; name: string | null; to: string | null; text: string | null; key: string | null }[];
    bubbles: { sessionId: string; text: string }[];
  };
};

declare global {
  interface Window {
    __mistwoodDebug?: MistwoodDebugApi;
  }
}

export const debugEnabled = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

function isClipKey(key: string): key is ClipKey {
  return (requiredClipKeys as readonly string[]).includes(key);
}

/** 截圖腳本與除錯使用。僅在開發模式或帶 ?debug 時暴露。 */
export function installDebugApi(): void {
  if (!debugEnabled) return;
  window.__mistwoodDebug = {
    isReady: () => useDebugStore.getState().sceneReady,
    bookmarks: () => cameraBookmarks.map((b) => b.id),
    setBookmark: (id) => {
      if (!cameraBookmarks.some((b) => b.id === id)) throw new Error(`未知的攝影機書籤：${id}`);
      useDebugStore.getState().requestBookmark(id);
    },
    setCameraMode: (mode) => useDebugStore.getState().setCameraMode(mode),
    viewAt: (position, target) => useDebugStore.getState().requestView({ position, target }),
    animKeys: () => requiredClipKeys,
    previewClip: (clip, fraction) => {
      playerRuntime.animPreview = { clip, fraction };
    },
    equip: (weapon) => authority.send({ type: 'EquipWeapon', weapon }),
    previewAnimation: (key, fraction = 0.4) => {
      if (key === null) {
        playerRuntime.animPreview = null;
        return;
      }
      if (!isClipKey(key)) throw new Error(`未知的動畫鍵：${key}`);
      playerRuntime.animPreview = { clip: getCharacterDef(PLAYER_CHARACTER_ID).clips[key], fraction };
    },
    playerState: () => {
      const { position, locomotion: l } = playerRuntime;
      return {
        ...position,
        anim: l.anim,
        grounded: l.grounded,
        speed: Math.hypot(l.vx, l.vz),
        facingYaw: l.facingYaw,
        action: playerRuntime.action?.clip ?? null,
        respawnCount: playerRuntime.respawnCount,
      };
    },
    teleport: (x, z, feetY) => {
      playerRuntime.teleportRequest = { x, z, feetY };
    },
    cameraAngles: () => ({ yaw: cameraRuntime.yaw, pitch: cameraRuntime.pitch, distance: cameraRuntime.distance }),
    camera: (set) => {
      Object.assign(cameraRuntime, set ?? {});
      return { ...cameraRuntime.position };
    },
    setMist: (value, instant = true) => {
      if (value === null) {
        useDebugStore.getState().setMistOverride(null, instant);
        return;
      }
      const level = parseMistLevel(value);
      if (level === null) throw new Error(`迷霧值必須是數字：${value}`);
      useDebugStore.getState().setMistOverride(level, instant);
    },
    mist: () => {
      const { x, z } = playerRuntime.position;
      return { current: mistRuntime.value, target: mistTargetAt(x, z), override: useDebugStore.getState().mistOverride };
    },
    setMistStage: (region, stage) => authority.send({ type: 'DebugSetMistStage', region, stage }),
    mistStages: () => ({ ...authority.getState().mist }),
    mapExplored: (map) => exploredRatio(authority.getState().explored, map ?? mapIdAt(playerRuntime.position.x, playerRuntime.position.z)),
    currentMap: () => ({ at: mapIdAt(playerRuntime.position.x, playerRuntime.position.z), shown: currentMap() }),
    travelToMap: (map) => {
      const enter = mapGateTo(map);
      if (!enter?.arriveAt) throw new Error(`沒有通往 ${map} 的出入口`);
      travelToMap(map, enter.arriveAt, enter.arriveDistance ?? 4);
    },
    isExplored: (x, z) => isExploredAt(authority.getState().explored, x, z),
    revealMap: () => authority.send({ type: 'DebugRevealMap' }),
    setMapOpen: (open) => setWorldMapOpen(open),
    questMarkers: () => currentQuestMarkers(authority.getState()).map(({ questId, kind, x, z }) => ({ questId, kind, x, z })),
    region: () => regionAt(regions, playerRuntime.position.x, playerRuntime.position.z),
    magic: () => ({
      mp: authority.getState().player.mp,
      cooldowns: Object.fromEntries(spellRuntime.cooldowns),
      casting: spellRuntime.casting?.spell.id ?? null,
      released: spellRuntime.casting?.released ?? false,
      projectiles: spellRuntime.projectiles.length,
      casts: spellRuntime.casts,
      hits: spellRuntime.hits,
      vfx: { ...vfxStats },
    }),
    setMp: (mp) => authority.send({ type: 'DebugSetMp', mp }),
    resetSpellCooldowns: () => spellRuntime.cooldowns.clear(),
    melee: () => {
      const m = combatRuntime.melee;
      return {
        weapon: authority.getState().player.weapon,
        shown: m.shown,
        comboCount: m.comboCount,
        heavyCooldown: m.heavyCooldown,
        actionClip: playerRuntime.action?.clipName ?? null,
        hitStop: m.hitStop,
        trail: combatRuntime.trail.length,
      };
    },
    clock: () => {
      const r = timeRuntime;
      return {
        time: r.time,
        hour: r.hour,
        day: r.day,
        phase: timePhase(r.hour),
        moonLight: r.moonLight,
        lightIntensity: r.lightIntensity,
        sun: { ...r.sun },
        moon: { ...r.moon },
        lookHour: r.lookHour,
        night: r.night,
      };
    },
    setClock: (hour) => {
      authority.send({ type: 'DebugSetClock', hour: ((hour % 24) + 24) % 24 });
      updateTimeRuntime(authority.getState().time);
    },
    boundary: () => ({
      distance: worldBoundaryDistance(playerRuntime.position.x, playerRuntime.position.z),
      near: boundaryRuntime.near,
      warnings: boundaryRuntime.warnings,
      colliders: boundaryRuntime.colliders,
    }),
    interactTarget: () => useUiStore.getState().interactTarget?.id ?? null,
    objectState: (id) => authority.getState().objects.get(id) ?? null,
    resetWorld: () => {
      authority.replaceState(initialGameState());
      useUiStore.getState().closeMessage();
    },
    inventory: () => [...authority.getState().inventory.slots],
    itemCount: (itemId) => countItem(authority.getState().inventory, itemId),
    enemyKnown: (id) => authority.getState().enemies.has(id),
    enemyAnim: (id) => enemyRuntime.get(id)?.anim ?? null,
    gameTime: () => authority.getState().time,
    send: (command) => authority.send(command),
    saveNow: () => saveGame(),
    exportSave: async () => (await saveStorage.export(MAIN_SLOT)).text(),
    settings: () => ({ quality: useSettingsStore.getState().quality, volumes: { ...useSettingsStore.getState().volumes } }),
    npcState: (id) => {
      const rt = npcRuntime.get(id);
      return rt ? { x: rt.x, z: rt.z, yaw: rt.yaw, walking: rt.walking, talking: rt.talking } : null;
    },
    dialogue: () => useUiStore.getState().dialogue,
    enemies: () =>
      [...enemyRuntime]
        .filter(([, v]) => v.vanishing === null)
        .map(([id, v]) => ({ id, kind: v.kind, x: v.ai.x, y: enemyY(v.ai.x, v.ai.z), z: v.ai.z, yaw: v.ai.yaw, state: v.ai.state, hp: authority.getState().enemies.get(id)?.hp ?? 0, anim: v.anim ?? null })),
    hitEnemy: (id, attack) => attackEnemy(id, attack),
    playerSlow: () => ({ ...combatRuntime.slow }),
    setPeaceful: (peaceful) => useDebugStore.getState().setPeaceful(peaceful),
    tap: (code) => input.injectTap(code),
    setPad: (pad) =>
      input.setPadOverride(
        pad ? { buttons: Array.from({ length: 16 }, (_, i) => pad.buttons?.[i] ?? 0), axes: Array.from({ length: 4 }, (_, i) => pad.axes?.[i] ?? 0) } : null,
      ),
    flock: (id) => {
      const sheep = ambientRuntime.flocks.get(id);
      return sheep ? { paused: ambientRuntime.flockPaused.get(id) ?? false, sheep: sheep.map((s) => ({ x: s.x, z: s.z, mode: s.mode })) } : null;
    },
    inputDevice: () => useInputDeviceStore.getState().device,
    padFocus: () => document.querySelector('.pad-focus')?.textContent?.trim() ?? null,
    location: () => useLocationStore.getState().location,
    audio: () => ({ state: audio.state, played: { ...audio.played }, music: audio.musicPlaying, birds: audio.birds, crickets: audio.crickets }),
    buildState: () => ({
      mode: useUiStore.getState().build,
      ghost: { x: buildRuntime.x, z: buildRuntime.z, yaw: buildRuntime.yaw, problem: buildRuntime.problem },
    }),
    buildings: () => authority.getState().buildings.map((b) => ({ ...b })),
    companion: () => ({ unlocked: authority.getState().companion.unlocked, x: companionRuntime.x, y: companionRuntime.y, z: companionRuntime.z }),
    face: (x, z) => {
      const { position, locomotion } = playerRuntime;
      locomotion.facingYaw = Math.atan2(x - position.x, z - position.z);
    },
    combatState: () => {
      const { hp, defeated } = authority.getState().player;
      return { hp, defeated, attackCooldown: combatRuntime.attackCooldown, skillCooldown: combatRuntime.skillCooldown };
    },
    lightPath: () => {
      const def = lightPaths[0];
      if (!def) throw new Error('沒有水鏡光路');
      const t = traceLight(def, (id) => worldIndex.placement(id), authority.getState().objects);
      return { lit: t.lit.length, solved: t.solved, beams: lightPathRuntime.beams };
    },
    questProgress: (id) => {
      const def = quests.get(id);
      if (!def) throw new Error(`未知的任務：${id}`);
      return objectiveProgress(authority.getState(), def)[0]?.current ?? 0;
    },
    questObjectives: (id) => {
      const def = quests.get(id);
      if (!def) throw new Error(`未知的任務：${id}`);
      return objectiveProgress(authority.getState(), def);
    },
    boss: () => bossDebug(),
    forceBossMove: (move) => {
      bossDebugState.force = move;
    },
    defeatedBosses: () => [...authority.getState().defeatedBosses],
    lighthouseBeam: () => lighthouseVisual.beam,
    openShop: (shop) => useUiStore.getState().setShop(shop),
    openCraft: (station) => useUiStore.getState().setCraft(station),
    windowGlow: () => ({ glow: windowGlowUniforms.uWindowGlow.value, ...windowGlowStats }),
    buildingStage: (id) => {
      const state = authority.getState();
      const b = state.buildings.find((x) => x.id === id);
      const def = b && buildables.get(b.buildable);
      return b && def ? growthStage(def, b, state.time) : null;
    },
    slowPlayer: (sec, scale) => {
      combatRuntime.slow.remaining = sec;
      combatRuntime.slow.scale = scale;
    },
    waterway: () => {
      const def = waterways[0];
      if (!def) return null;
      return { ...waterwayFlow(def, authority.getState().objects), ...waterwayRuntime, flumeReach: [...waterwayRuntime.flumeReach] };
    },
    setQuestCompleted: (id) => {
      if (!quests.has(id)) throw new Error(`未知的任務：${id}`);
      const state = authority.getState();
      authority.replaceState({ ...state, quests: { ...state.quests, [id]: { status: 'completed' } } });
    },
    questState: (id) => {
      const def = quests.get(id);
      if (!def) throw new Error(`未知的任務：${id}`);
      return questStatus(authority.getState(), def);
    },
    toasts: () => useUiStore.getState().toasts.map(({ itemId, count, textKey }) => ({ itemId, count, textKey })),
    activeColliders: () => perfStats.activeColliders,
    perf: () => {
      // performance.memory 為 Chromium 專有 API
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return { ...perfStats, jsHeapMB: memory ? memory.usedJSHeapSize / 1048576 : null };
    },
    flow: (action) => {
      useGameStore.getState().send(action);
      return useGameStore.getState().screen;
    },
    net: () => {
      const s = useNetStore.getState();
      return {
        status: s.status,
        playerCount: s.playerCount,
        roomId: s.roomId,
        sessionId: s.sessionId,
        playerId: s.playerId,
        error: s.error,
        corrections: remoteRuntime.corrections,
        lastCorrection: remoteRuntime.lastCorrection?.reason ?? null,
        actionsSent: remoteRuntime.actionsSent,
        actionsReceived: remoteRuntime.actionsReceived,
        actionsPlayed: remoteRuntime.actionsPlayed,
      };
    },
    remotePlayers: () => {
      const loc = useLocationStore.getState();
      const now = performance.now();
      return [...remoteRuntime.players.values()].map((entry) => {
        const view = entry.view;
        const pose = remotePose(entry, now) ?? view;
        return {
          sessionId: view.sessionId,
          name: view.name,
          x: view.x,
          y: view.y,
          z: view.z,
          rx: pose.x,
          ry: pose.y,
          rz: pose.z,
          anim: view.anim,
          map: view.map,
          location: view.location,
          visible: view.map === loc.map && view.location === loc.location,
          online: view.online,
          delayMs: entry.delay.current(now),
          weapon: view.weapon,
          clip: entry.shown?.clip ?? null,
          held: entry.shown?.held ?? null,
        };
      });
    },
    netConnect: (options) => connect(options),
    netDisconnect: () => disconnect(),
    netReconnect: () => reconnect(),
    netSendRaw: (type, payload) => sendRaw(type, payload),
    chat: () => {
      const now = performance.now();
      const { lines, channel } = useChatStore.getState();
      return {
        open: useUiStore.getState().chatOpen,
        channel,
        lines: lines.map((l) => ({ channel: l.channel, name: l.from?.name ?? null, to: l.to ?? null, text: l.text ?? null, key: l.key ?? null })),
        bubbles: [...chatRuntime.bubbles.entries()].filter(([, b]) => b.until > now).map(([sessionId, b]) => ({ sessionId, text: b.text })),
      };
    },
  };
}

/** 讀取初始 ?mist= 參數（0–1）；不合法時回傳 null。 */
export function initialMistFromUrl(): number | null {
  return parseMistLevel(new URLSearchParams(window.location.search).get('mist'));
}

/** 讀取初始 ?clock= 參數（0–24 小時）；不合法時回傳 null。 */
export function initialClockFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('clock');
  const hour = raw === null ? NaN : Number(raw);
  return Number.isFinite(hour) && hour >= 0 && hour <= 24 ? hour : null;
}

/** 讀取初始 ?cam= 參數。 */
export function initialBookmarkFromUrl(): string | null {
  const cam = new URLSearchParams(window.location.search).get('cam');
  return cam && cameraBookmarks.some((b) => b.id === cam) ? cam : null;
}
