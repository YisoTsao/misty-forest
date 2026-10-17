import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterDef, ClipKey } from '@/game-core/character/characterDef';
import { moveClips, type WeaponId } from '@/game-core/combat/weapons';
import { authority, weapons } from '@/game/authority';
import { combatRuntime } from '@/game/combat/combatRuntime';
import { playerRuntime, type PlayerAction } from '@/game/player/localRuntime';
import { assetUrl } from '@/game/worldData';
import { toToonMaterial } from '@/render/toon';

const FADE = 0.15;
/** 近戰招式之間切換較快，連段才俐落 */
const MOVE_FADE = 0.08;
/** 只播一次並停在最後一格的動畫 */
const ONE_SHOT: readonly ClipKey[] = ['jump', 'land', 'interact', 'attack', 'skill', 'hit', 'death'];

/**
 * 手上拿的東西都是同系列（KayKit Adventurers）角色模型裡的武器節點（GAME_DESIGN 5.3）：
 * 角色模型本身有的（旅人的雙刀、騎士的劍、法師的法杖、戰士的斧頭）直接顯示原本隱藏的節點；
 * 沒有的從其他角色模型複製第一個節點掛到右手 handslot（例如旅人拿騎士的單手劍、施法時拿法師的魔杖）。
 */
export const WEAPON_SOURCES = {
  knight: 'models/characters/kaykit-adventurers/Knight.glb',
  mage: 'models/characters/kaykit-adventurers/Mage.glb',
  barbarian: 'models/characters/kaykit-adventurers/Barbarian.glb',
} as const;
type WeaponSource = keyof typeof WEAPON_SOURCES;
const HELD_NODES: Record<HeldId, { nodes: readonly string[]; source?: WeaponSource }> = {
  fist: { nodes: [] },
  knife: { nodes: ['Knife', 'Knife_Offhand'] },
  sword: { nodes: ['1H_Sword'], source: 'knight' },
  greatsword: { nodes: ['2H_Sword'], source: 'knight' },
  staff: { nodes: ['2H_Staff'], source: 'mage' },
  axe: { nodes: ['1H_Axe', '1H_Axe_Offhand'], source: 'barbarian' },
  greataxe: { nodes: ['2H_Axe'], source: 'barbarian' },
  /** 魔杖：施法時拿在右手（GAME_DESIGN 5.4） */
  wand: { nodes: ['1H_Wand'], source: 'mage' },
};

/** 武器來源模型（已由 useGLTF 載入的場景） */
export type WeaponSourceScenes = Record<WeaponSource, THREE.Object3D>;

/** 載入全部武器來源模型（三個 GLB 與村莊 NPC 共用快取） */
export function useWeaponSources(): WeaponSourceScenes {
  const knight = useGLTF(assetUrl(WEAPON_SOURCES.knight)).scene;
  const mage = useGLTF(assetUrl(WEAPON_SOURCES.mage)).scene;
  const barbarian = useGLTF(assetUrl(WEAPON_SOURCES.barbarian)).scene;
  return useMemo(() => ({ knight, mage, barbarian }), [knight, mage, barbarian]);
}

/** 施法時手上拿的東西：拿著法杖就用法杖施法，其他武器換成魔杖 */
export function castHeld(weapon: WeaponId): HeldId {
  return weapon === 'staff' ? 'staff' : 'wand';
}
/** 揮砍拖尾取樣的時間（秒） */
export const TRAIL_LIFE = 0.14;

/** 複製骨架模型、隱藏武器掛件、材質轉 toon。回傳的材質需由呼叫端釋放。 */
export function prepareModel(source: THREE.Object3D, hidden: readonly string[]) {
  const root = cloneSkinned(source);
  const materials: THREE.Material[] = [];
  root.traverse((obj) => {
    if (hidden.includes(obj.name)) obj.visible = false;
    if (obj instanceof THREE.Mesh) {
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (mat) {
        obj.material = toToonMaterial(mat);
        materials.push(obj.material);
      }
      obj.castShadow = true;
      // 骨架動畫會讓包圍盒失準，關閉剔除避免角色在畫面邊緣消失
      obj.frustumCulled = false;
    }
  });
  return { root, materials };
}

/** 武器的刀尖與刀柄（模型局部座標）：沿包圍盒最長的軸，離原點（握把）較遠的一端為刀尖 */
function bladeOf(mesh: THREE.Object3D): { tip: THREE.Vector3; base: THREE.Vector3 } {
  const box = new THREE.Box3();
  mesh.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.computeBoundingBox();
      if (o.geometry.boundingBox) box.union(o.geometry.boundingBox);
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const far = Math.abs(box.max[axis]) >= Math.abs(box.min[axis]) ? box.max[axis] : box.min[axis];
  const tip = new THREE.Vector3();
  tip[axis] = far;
  const base = tip.clone().multiplyScalar(0.3);
  return { tip, base };
}

/** 手上顯示的東西：近戰武器，或施法時的魔杖 */
export type HeldId = WeaponId | 'wand';

export type WeaponModels = {
  /** 每種武器要顯示的節點 */
  nodes: Record<HeldId, THREE.Object3D[]>;
  /** 拖尾用的主手武器與刀尖位置 */
  blade: Partial<Record<WeaponId, { object: THREE.Object3D; tip: THREE.Vector3; base: THREE.Vector3 }>>;
  materials: THREE.Material[];
};

/** 從其他角色模型複製手持物件（劍、魔杖），材質轉 toon，掛到右手 handslot（同系列模型的 handslot 局部座標相同） */
function attachFrom(hand: THREE.Object3D | undefined, source: THREE.Object3D, node: string, materials: THREE.Material[]): THREE.Object3D | null {
  const original = source.getObjectByName(node);
  if (!hand || !original) return null;
  const copy = original.clone(true);
  copy.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mat) {
        o.material = toToonMaterial(mat);
        materials.push(o.material);
      }
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  copy.visible = false;
  hand.add(copy);
  return copy;
}

/** 每種手持物：角色模型本身有就用自己的節點，沒有就從來源模型複製一份掛到右手 handslot；刀刃類記錄拖尾用的刀尖 */
export function attachWeapons(root: THREE.Object3D, sources: WeaponSourceScenes): WeaponModels {
  // GLTFLoader 會移除節點名稱中的「.」（PropertyBinding.sanitizeNodeName），handslot.r 載入後是 handslotr
  const hand = root.getObjectByName('handslotr') ?? root.getObjectByName('handslot.r');
  const materials: THREE.Material[] = [];
  const nodes = {} as Record<HeldId, THREE.Object3D[]>;
  const blade: WeaponModels['blade'] = {};
  for (const [id, spec] of Object.entries(HELD_NODES) as [HeldId, (typeof HELD_NODES)[HeldId]][]) {
    const own = spec.nodes.map((n) => root.getObjectByName(n)).filter((o): o is THREE.Object3D => o !== undefined);
    const copy = own.length === 0 && spec.source && spec.nodes[0] ? attachFrom(hand, sources[spec.source], spec.nodes[0], materials) : null;
    nodes[id] = own.length > 0 ? own : copy ? [copy] : [];
    const main = nodes[id][0];
    if (main && id !== 'fist' && id !== 'wand') blade[id] = { object: main, ...bladeOf(main) };
  }
  return { nodes, blade, materials };
}

const tmpTip = new THREE.Vector3();
const tmpBase = new THREE.Vector3();

/**
 * 玩家角色外觀與動畫。動畫依 playerRuntime.locomotion.anim 交叉淡入淡出，
 * 每幀只比對字串，狀態改變時才切換，不觸發 React 重新渲染。
 * 近戰（GAME_DESIGN 5.3）：依裝備顯示武器、播放招式動畫（每一招都重新開始）、命中停頓、記錄揮砍拖尾。
 */
export function CharacterModel({ def }: { def: CharacterDef }) {
  const gltf = useGLTF(assetUrl(def.model));
  const sources = useWeaponSources();
  const { root, materials } = useMemo(() => prepareModel(gltf.scene, def.hiddenNodes), [gltf.scene, def.hiddenNodes]);
  const weaponModels = useMemo(() => attachWeapons(root, sources), [root, sources]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useEffect(() => () => weaponModels.materials.forEach((m) => m.dispose()), [weaponModels]);

  const groupRef = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(gltf.animations, groupRef);
  const current = useRef<{ clip: string; preview: boolean; action: PlayerAction | null } | null>(null);
  const shown = useRef<HeldId | null>(null);

  useEffect(() => {
    // 驗證所有片段都存在；缺漏時拋錯交給 AssetBoundary 顯示
    const clips = [...Object.values(def.clips), ...moveClips(weapons)];
    const missing = clips.filter((name) => !actions[name]);
    if (missing.length > 0) throw new Error(`角色 ${def.id} 缺少動畫片段：${missing.join(', ')}`);
    for (const name of [...ONE_SHOT.map((key) => def.clips[key]), ...moveClips(weapons)]) {
      const action = actions[name];
      action?.setLoop(THREE.LoopOnce, 1);
      if (action) action.clampWhenFinished = true;
    }
  }, [actions, def]);

  useFrame((_, dt) => {
    const melee = combatRuntime.melee;
    // 命中停頓：動畫暫停一小段時間（打擊感）
    mixer.timeScale = melee.hitStop > 0 ? 0 : 1;

    // 手上顯示：施法時拿魔杖（法杖就用法杖），否則依權威狀態的裝備；切換時從小放大出現
    const weapon = authority.getState().player.weapon;
    const held: HeldId = playerRuntime.action?.clip === 'skill' ? castHeld(weapon) : weapon;
    if (shown.current !== held) {
      for (const list of Object.values(weaponModels.nodes)) for (const o of list) o.visible = false;
      for (const o of weaponModels.nodes[held]) o.visible = true;
      if (shown.current !== null) melee.equipPop = 0;
      shown.current = held;
      melee.shown = held;
    }
    if (melee.equipPop < 1) {
      melee.equipPop = Math.min(1, melee.equipPop + dt / 0.18);
      const s = 0.2 + 0.8 * (1 - (1 - melee.equipPop) ** 3);
      for (const o of weaponModels.nodes[held]) o.scale.setScalar(s);
    }

    const preview = playerRuntime.animPreview;
    const action = playerRuntime.action;
    const clip = preview?.clip ?? action?.clipName ?? def.clips[action ? action.clip : playerRuntime.locomotion.anim];
    const next = actions[clip];
    if (!next) return;

    if (preview) {
      // 截圖驗證用：立即切換並停在指定時間點
      if (current.current?.clip !== clip || !current.current.preview) {
        Object.values(actions).forEach((a) => a?.stop());
        next.reset().play();
        current.current = { clip, preview: true, action: null };
      }
      next.paused = true;
      next.time = next.getClip().duration * preview.fraction;
      next.weight = 1;
      return;
    }

    recordTrail(weapon, action, dt);

    // 同一個動畫片段但是新的一招（例如連續兩次同樣的踢）也要從頭播放
    const sameMove = current.current?.clip === clip && (!action?.clipName || current.current.action === action);
    if (sameMove && !current.current?.preview) return;
    const prev = current.current ? actions[current.current.clip] : undefined;
    const fade = action?.clipName ? MOVE_FADE : FADE;
    next.reset();
    next.paused = false;
    next.setEffectiveTimeScale(action?.speed ?? 1);
    next.setEffectiveWeight(1).fadeIn(prev ? fade : 0).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    current.current = { clip, preview: false, action };
  });

  /** 刀、劍揮砍時記錄刀尖與刀柄的世界座標（GAME_DESIGN 5.3：揮砍拖尾） */
  function recordTrail(weapon: WeaponId, action: PlayerAction | null, dt: number): void {
    const trail = combatRuntime.trail;
    for (const s of trail) s.age += dt;
    while (trail.length > 0 && trail[0]!.age > TRAIL_LIFE) trail.shift();
    const blade = weaponModels.blade[weapon];
    if (!blade || action?.clip !== 'attack' || !action.clipName || combatRuntime.melee.hitStop > 0) return;
    blade.object.updateWorldMatrix(true, false);
    tmpTip.copy(blade.tip).applyMatrix4(blade.object.matrixWorld);
    tmpBase.copy(blade.base).applyMatrix4(blade.object.matrixWorld);
    trail.push({ tip: [tmpTip.x, tmpTip.y, tmpTip.z], base: [tmpBase.x, tmpBase.y, tmpBase.z], age: 0 });
    if (trail.length > 32) trail.shift();
  }

  return (
    <group ref={groupRef} scale={def.scale}>
      <primitive object={root} />
    </group>
  );
}

for (const path of Object.values(WEAPON_SOURCES)) useGLTF.preload(assetUrl(path));
