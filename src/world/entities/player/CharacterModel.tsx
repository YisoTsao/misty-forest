import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterDef, ClipKey } from '@/game-core/character/characterDef';
import { playerRuntime } from '@/game/player/localRuntime';
import { assetUrl } from '@/game/worldData';
import { toToonMaterial } from '@/render/toon';

const FADE = 0.15;
/** 只播一次並停在最後一格的動畫 */
const ONE_SHOT: readonly ClipKey[] = ['jump', 'land', 'interact'];

/** 複製骨架模型、隱藏武器掛件、材質轉 toon。回傳的材質需由呼叫端釋放。 */
function prepareModel(source: THREE.Object3D, hidden: readonly string[]) {
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

/**
 * 玩家角色外觀與動畫。動畫依 playerRuntime.locomotion.anim 交叉淡入淡出，
 * 每幀只比對字串，狀態改變時才切換，不觸發 React 重新渲染。
 */
export function CharacterModel({ def }: { def: CharacterDef }) {
  const gltf = useGLTF(assetUrl(def.model));
  const { root, materials } = useMemo(() => prepareModel(gltf.scene, def.hiddenNodes), [gltf.scene, def.hiddenNodes]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  const groupRef = useRef<THREE.Group>(null);
  const { actions } = useAnimations(gltf.animations, groupRef);
  const current = useRef<{ clip: string; preview: boolean } | null>(null);

  useEffect(() => {
    // 驗證所有片段都存在；缺漏時拋錯交給 AssetBoundary 顯示
    const missing = Object.values(def.clips).filter((name) => !actions[name]);
    if (missing.length > 0) throw new Error(`角色 ${def.id} 缺少動畫片段：${missing.join(', ')}`);
    for (const key of ONE_SHOT) {
      const action = actions[def.clips[key]];
      action?.setLoop(THREE.LoopOnce, 1);
      if (action) action.clampWhenFinished = true;
    }
  }, [actions, def]);

  useFrame(() => {
    const preview = playerRuntime.animPreview;
    const action = playerRuntime.action;
    const clip = preview?.clip ?? def.clips[action ? action.clip : playerRuntime.locomotion.anim];
    const next = actions[clip];
    if (!next) return;

    if (preview) {
      // 截圖驗證用：立即切換並停在指定時間點
      if (current.current?.clip !== clip || !current.current.preview) {
        Object.values(actions).forEach((a) => a?.stop());
        next.reset().play();
        current.current = { clip, preview: true };
      }
      next.paused = true;
      next.time = next.getClip().duration * preview.fraction;
      next.weight = 1;
      return;
    }

    if (current.current?.clip === clip && !current.current.preview) return;
    const prev = current.current ? actions[current.current.clip] : undefined;
    next.reset();
    next.paused = false;
    next.setEffectiveWeight(1).fadeIn(prev ? FADE : 0).play();
    if (prev && prev !== next) prev.fadeOut(FADE);
    current.current = { clip, preview: false };
  });

  return (
    <group ref={groupRef} scale={def.scale}>
      <primitive object={root} />
    </group>
  );
}
