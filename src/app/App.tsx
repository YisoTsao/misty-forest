import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { debugEnabled, initialBookmarkFromUrl, initialClockFromUrl, initialMistFromUrl } from '@/game/debugApi';
import { t } from '@/game/i18n';
import { useDebugStore } from '@/game/state/debugStore';
import { useQualityPreset } from '@/game/state/settingsStore';
import { worldDataResult } from '@/game/worldData';
import { BuildUi } from '@/ui/BuildUi';
import { BossBar } from '@/ui/BossBar';
import { CombatHud } from '@/ui/CombatHud';
import { CompanionBubble } from '@/ui/CompanionBubble';
import { ControlHint } from '@/ui/ControlHint';
import { DebugPanel } from '@/ui/DebugPanel';
import { DialogueBox } from '@/ui/DialogueBox';
import { ErrorOverlay } from '@/ui/ErrorOverlay';
import { FatalScreen } from '@/ui/FatalScreen';
import { InteractPrompt } from '@/ui/InteractPrompt';
import { InventoryPanel } from '@/ui/InventoryPanel';
import { Minimap } from '@/ui/map/Minimap';
import { WorldMap } from '@/ui/map/WorldMap';
import { LocationFade } from '@/ui/LocationFade';
import { MessageDialog } from '@/ui/MessageDialog';
import { PauseMenu } from '@/ui/PauseMenu';
import { PerfPanel } from '@/ui/PerfPanel';
import { QuestTracker } from '@/ui/QuestTracker';
import { RegionBanner } from '@/ui/RegionBanner';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { TitleScreen } from '@/ui/TitleScreen';
import { Toasts } from '@/ui/Toasts';
import { TutorialPanel } from '@/ui/TutorialPanel';
import { WorldScene } from '@/world/WorldScene';

export function App() {
  const preset = useQualityPreset();
  useEffect(() => {
    // ?cam=<書籤> 直接以自由視角開啟該書籤
    const cam = initialBookmarkFromUrl();
    if (cam) useDebugStore.getState().requestBookmark(cam);
    // ?mist=0–1 設定迷霧程度（截圖驗收晴朗 / 迷霧兩種外觀）
    const mist = initialMistFromUrl();
    if (mist !== null) useDebugStore.getState().setMistOverride(mist, true);
    // ?clock=0–24 固定畫面時段（截圖驗收日夜外觀，GAME_DESIGN 5.2）
    const clock = initialClockFromUrl();
    if (clock !== null) useDebugStore.getState().setClockOverride(clock);
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
      <div id="damage-layer" className="pointer-events-none absolute inset-0 overflow-hidden" />
      <CombatHud />
      <BossBar />
      <CompanionBubble />
      <InteractPrompt />
      <Toasts />
      <TutorialPanel />
      <RegionBanner />
      <QuestTracker />
      <Minimap />
      <ControlHint />
      {debugEnabled && (
        <>
          <PerfPanel />
          <DebugPanel />
        </>
      )}
      <MessageDialog />
      <DialogueBox />
      <InventoryPanel />
      <BuildUi />
      <LocationFade />
      <TitleScreen />
      <PauseMenu />
      <WorldMap />
      <SettingsPanel />
      <ErrorOverlay />
    </div>
  );
}
