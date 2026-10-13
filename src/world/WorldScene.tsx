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
import { AudioSystem } from './AudioSystem';
import { GameClock } from './GameClock';
import { TutorialSystem } from './TutorialSystem';
import { RegionTracker } from './RegionTracker';
import { TitleCameraRig } from './camera/TitleCameraRig';
import { PerfProbe } from './debug/PerfProbe';
import { SceneReadyProbe } from './debug/SceneReadyProbe';
import { BoundaryColliders, BoundaryWatcher, MistWall } from './boundary/WorldBoundary';
import { BuildController } from './build/BuildController';
import { BuiltObjects } from './build/BuiltObjects';
import { CombatEffects } from './combat/CombatEffects';
import { MeleeEffects } from './combat/MeleeEffects';
import { PlayerCombat } from './combat/PlayerCombat';
import { PlayerSpells } from './combat/PlayerSpells';
import { VfxSystem } from './vfx/VfxSystem';
import { Companion } from './entities/companion/Companion';
import { Enemies } from './entities/enemy/Enemies';
import { Npcs } from './entities/npc/Npcs';
import { Player } from './entities/player/Player';
import { InputBinder } from './InputBinder';
import { ChimneySmoke } from './ambient/ChimneySmoke';
import { Fireflies } from './ambient/Fireflies';
import { Flocks } from './ambient/Flock';
import { InteriorLights, OutdoorOnly } from './LocationVisibility';
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
      <InteriorLights />
      <OutdoorOnly>
        <Sky />
      </OutdoorOnly>
      <Suspense fallback={null}>
        {/* timeStep="vary"：每幀一步，與 useFrame 中的角色控制器同步 */}
        <Physics timeStep="vary" gravity={[0, -22, 0]}>
          <OutdoorOnly>
            <Terrain />
          </OutdoorOnly>
          <EnvironmentColliders index={index} />
          <BoundaryColliders />
          <Player def={playerDef} colliderRef={playerCollider} />
          <OutdoorOnly>
            <Flocks />
          </OutdoorOnly>
          <Npcs />
          <Enemies />
          <BuiltObjects />
          {cameraMode === 'follow' && !onTitle && <FollowCamera playerCollider={playerCollider} />}
        </Physics>
        <AssetBoundary name="world-placements">
          <WorldPlacements data={data} />
        </AssetBoundary>
        <OutdoorOnly>
          <GrassField index={index} />
          <Lake />
          <MistWall />
          <Fireflies />
          <ChimneySmoke data={data} />
          <AssetBoundary name="backdrop">
            <Backdrop />
          </AssetBoundary>
        </OutdoorOnly>
        <InteractionSystem index={index} />
        <GameClock />
        <TutorialSystem />
        <RegionTracker />
        <BoundaryWatcher />
        <PlayerCombat />
        <PlayerSpells />
        <CombatEffects />
        <MeleeEffects />
        <VfxSystem />
        <Companion />
        <BuildController />
        <SceneReadyProbe />
      </Suspense>
      {cameraMode === 'follow' && onTitle && <TitleCameraRig />}
      {cameraMode === 'free' && <DebugCameraRig />}
      <PostEffects />
      <AudioSystem />
      <PerfProbe />
    </>
  );
}
