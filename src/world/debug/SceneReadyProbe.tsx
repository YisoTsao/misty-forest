import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useDebugStore } from '@/game/state/debugStore';

const FRAMES_BEFORE_READY = 5;

/**
 * 放在 Suspense 內最後一個位置：所有資產載入後，再等數幀讓陰影與材質編譯完成，
 * 才標記場景就緒（截圖腳本依此判斷）。只寫入 store 一次。
 */
export function SceneReadyProbe() {
  const frames = useRef(0);
  const done = useRef(false);
  const setSceneReady = useDebugStore((s) => s.setSceneReady);

  useEffect(() => () => setSceneReady(false), [setSceneReady]);

  useFrame(() => {
    if (done.current) return;
    frames.current++;
    if (frames.current >= FRAMES_BEFORE_READY) {
      done.current = true;
      setSceneReady(true);
    }
  });

  return null;
}
