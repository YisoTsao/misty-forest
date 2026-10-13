import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { debugEnabled, initialBookmarkFromUrl, initialMistFromUrl } from '@/game/debugApi';
import { t } from '@/game/i18n';
import { useDebugStore } from '@/game/state/debugStore';
import { useQualityPreset } from '@/game/state/settingsStore';
import { worldDataResult } from '@/game/worldData';
import { ControlHint } from '@/ui/ControlHint';
import { DebugPanel } from '@/ui/DebugPanel';
import { ErrorOverlay } from '@/ui/ErrorOverlay';
import { FatalScreen } from '@/ui/FatalScreen';
import { InteractPrompt } from '@/ui/InteractPrompt';
import { MessageDialog } from '@/ui/MessageDialog';
import { PauseMenu } from '@/ui/PauseMenu';
import { PerfPanel } from '@/ui/PerfPanel';
import { TitleScreen } from '@/ui/TitleScreen';
import { Toasts } from '@/ui/Toasts';
import { WorldScene } from '@/world/WorldScene';

export function App() {
  const preset = useQualityPreset();
  useEffect(() => {
    // ?cam=<書籤> 直接以自由視角開啟該書籤
    const cam = initialBookmarkFromUrl();
    if (cam) useDebugStore.getState().requestBookmark(cam);
    // ?mist=0–1 設定迷霧程度（截圖驗收晴朗 / 迷霧兩種外觀）
    const mist = initialMistFromUrl();
    if (mist !== null) useDebugStore.getState().setMistTarget(mist, true);
  }, []);

  if (!worldDataResult.ok) return <FatalScreen title={t('error.worldData')} detail={worldDataResult.error} />;

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, preset.maxDpr]}
        camera={{ fov: 50, near: 0.1, far: 900, position: [0, 3, 24] }}
        gl={{ antialias: true, preserveDrawingBuffer: debugEnabled, toneMapping: THREE.NeutralToneMapping }}
      >
        <WorldScene data={worldDataResult.data} />
      </Canvas>
      <InteractPrompt />
      <Toasts />
      <ControlHint />
      {debugEnabled && (
        <>
          <PerfPanel />
          <DebugPanel />
        </>
      )}
      <MessageDialog />
      <TitleScreen />
      <PauseMenu />
      <ErrorOverlay />
    </div>
  );
}
