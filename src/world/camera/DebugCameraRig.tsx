import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import { useDebugStore } from '@/game/state/debugStore';
import { cameraBookmarks } from '@/game/worldData';

/** 除錯用自由視角：OrbitControls + 攝影機書籤（截圖驗收與美術比對）。 */
export function DebugCameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const bookmark = useDebugStore((s) => s.bookmark);

  useEffect(() => {
    if (!bookmark) return;
    const def = cameraBookmarks.find((b) => b.id === bookmark.id);
    const ctrl = controls.current;
    if (!def || !ctrl) return;
    camera.position.fromArray(def.position);
    ctrl.target.fromArray(def.target);
    ctrl.update();
  }, [bookmark, camera]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      maxPolarAngle={Math.PI * 0.49}
      minDistance={1.5}
      maxDistance={180}
    />
  );
}
