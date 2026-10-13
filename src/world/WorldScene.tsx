import { Physics, type RapierCollider } from '@react-three/rapier';
import { Suspense, useRef } from 'react';
import type { WorldData } from '@/game-core/world/worldData';
import { getCharacterDef, PLAYER_CHARACTER_ID } from '@/game/character/characters';
import { useDebugStore } from '@/game/state/debugStore';
import { useGameStore } from '@/game/state/gameStore';
import { worldIndex as index } from '@/game/authority';
import { PostEffects } from '@/render/PostEffects';
import { AssetBoundary } from './AssetBoundary';
import { DebugCameraRig } from './camera/DebugCameraRig';
import { FollowCamera } from './camera/FollowCamera';
import { GameClock } from './GameClock';
import { TutorialSystem } from './TutorialSystem';
import { RegionTracker } from './RegionTracker';
import { TitleCameraRig } from './camera/TitleCameraRig';
import { PerfProbe } from './debug/PerfProbe';
import { SceneReadyProbe } from './debug/SceneReadyProbe';
import { CombatEffects } from './combat/CombatEffects';
import { PlayerCombat } from './combat/PlayerCombat';
import { Companion } from './entities/companion/Companion';
import { Enemies } from './entities/enemy/Enemies';
import { Npcs } from './entities/npc/Npcs';
import { Player } from './entities/player/Player';
import { InputBinder } from './InputBinder';
import { InteractionSystem } from './interaction/InteractionSystem';
import { EnvironmentColliders } from './physics/EnvironmentColliders';
import { Lighting } from './sky/Lighting';
import { Backdrop } from './sky/Backdrop';
import { Sky } from './sky/Sky';
import { Terrain } from './terrain/Terrain';
import { Lake } from './water/Lake';
import { GrassField } from './vegetation/GrassField';
import { WorldPlacements } from './vegetation/WorldPlacements';

const playerDef = getCharacterDef(PLAYER_CHARACTER_ID);

/** 開放世界場景組合：每個系統為獨立元件（規格 3-5）。 */
export function WorldScene({ data }: { data: WorldData }) {
  const cameraMode = useDebugStore((s) => s.cameraMode);
  const onTitle = useGameStore((s) => s.screen === 'title');
  const playerCollider = useRef<RapierCollider>(null);

  return (
    <>
      <InputBinder />
      <Lighting />
      <Sky />
      <Suspense fallback={null}>
        {/* timeStep="vary"：每幀一步，與 useFrame 中的角色控制器同步 */}
        <Physics timeStep="vary" gravity={[0, -22, 0]}>
          <Terrain />
          <EnvironmentColliders index={index} />
          <Player def={playerDef} colliderRef={playerCollider} />
          <Npcs />
          <Enemies />
          {cameraMode === 'follow' && !onTitle && <FollowCamera playerCollider={playerCollider} />}
        </Physics>
        <AssetBoundary name="world-placements">
          <WorldPlacements data={data} />
        </AssetBoundary>
        <GrassField index={index} />
        <Lake />
        <AssetBoundary name="backdrop">
          <Backdrop />
        </AssetBoundary>
        <InteractionSystem index={index} />
        <GameClock />
        <TutorialSystem />
        <RegionTracker />
        <PlayerCombat />
        <CombatEffects />
        <Companion />
        <SceneReadyProbe />
      </Suspense>
      {cameraMode === 'follow' && onTitle && <TitleCameraRig />}
      {cameraMode === 'free' && <DebugCameraRig />}
      <PostEffects />
      <PerfProbe />
    </>
  );
}
