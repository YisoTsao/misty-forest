import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { perfStats } from '@/game/perfStats';

/** 收集 renderer 統計值寫入 perfStats，不觸發 React 狀態更新。 */
export function PerfProbe() {
  const acc = useRef({ frames: 0, time: 0 });
  const gl = useThree((s) => s.gl);

  // 後處理每幀會呼叫多次 render，自動重設只會留下最後一個 pass 的數字；改為每幀手動重設、累計整幀
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  // 維持預設優先序（正數會讓 R3F 停止自動渲染）；此時 gl.info 為上一幀（含所有後處理 pass）的累計
  useFrame((_, delta) => {
    perfStats.drawCalls = gl.info.render.calls;
    perfStats.triangles = gl.info.render.triangles;
    perfStats.geometries = gl.info.memory.geometries;
    perfStats.textures = gl.info.memory.textures;
    gl.info.reset();

    const a = acc.current;
    a.frames++;
    a.time += delta;
    if (a.time >= 0.5) {
      perfStats.fps = a.frames / a.time;
      perfStats.frameMs = (a.time / a.frames) * 1000;
      a.frames = 0;
      a.time = 0;
    }
  });

  return null;
}
