import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';

/**
 * 載入後預先編譯所有 shader（含陰影的深度材質），移動時不再卡頓。
 * 遠處的區塊、怪物、另一張地圖在載入時是隱藏的，three 只在物件第一次被畫出時才編譯它的 program，
 * 於是跑進新範圍時會有 40–200 ms 的長幀。這裡在載入後的第一次場景渲染前把隱藏的物件暫時打開、關閉視錐剔除，
 * 讓這一次渲染（含後處理的同一個 render target 設定與陰影 pass）編譯全部組合，渲染完立刻還原。
 * 放在 Suspense 內：資產都載入後才執行；SceneReadyProbe 等的幾幀內就會完成。
 */
export function ShaderWarmup() {
  const scene = useThree((s) => s.scene);
  const done = useRef(false);

  useFrame(() => {
    if (done.current) return;
    done.current = true;
    const hidden: THREE.Object3D[] = [];
    const culled: THREE.Object3D[] = [];
    const lightsOff: THREE.Object3D[] = [];
    const { onBeforeRender, onAfterRender } = scene;
    // 在 renderer 內部、這一幀的第一次場景渲染前後切換，其他元件的 useFrame 看不到暫時的狀態
    scene.onBeforeRender = (...args) => {
      onBeforeRender.apply(scene, args);
      // 光源數量是 program 的一部分：原本沒有作用的光源（在隱藏的群組裡）維持關閉，否則編譯出的是用不到的組合
      const activeLights = new Set<THREE.Object3D>();
      scene.traverseVisible((o) => {
        if ((o as THREE.Light).isLight) activeLights.add(o);
      });
      scene.traverse((o) => {
        if ((o as THREE.Light).isLight) {
          if (o.visible && !activeLights.has(o)) {
            lightsOff.push(o);
            o.visible = false;
          }
          return;
        }
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
        if (o.frustumCulled) {
          culled.push(o);
          o.frustumCulled = false;
        }
      });
    };
    scene.onAfterRender = (...args) => {
      for (const o of hidden) o.visible = false;
      for (const o of culled) o.frustumCulled = true;
      for (const o of lightsOff) o.visible = true;
      scene.onBeforeRender = onBeforeRender;
      scene.onAfterRender = onAfterRender;
      onAfterRender.apply(scene, args);
    };
  });

  return null;
}
