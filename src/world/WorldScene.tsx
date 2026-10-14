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
import { MapExplorer } from './MapExplorer';
import { TitleCameraRig } from './camera/TitleCameraRig';
import { PerfProbe } from './debug/PerfProbe';
import { SceneReadyProbe } from './debug/SceneReadyProbe';
import { ShaderWarmup } from './debug/ShaderWarmup';
import { BossArenas } from './boss/BossArena';
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
import { InteriorLights, MapOnly, OutdoorOnly } from './LocationVisibility';
import { MapTracker } from './MapTracker';
import { InteractionSystem } from './interaction/InteractionSystem';
import { EnvironmentColliders } from './physics/EnvironmentColliders';
import { Lighting } from './sky/Lighting';
import { Backdrop } from './sky/Backdrop';
import { Sky } from './sky/Sky';
import { Terrain } from './terrain/Terrain';
import { Water } from './water/Water';
import { LighthouseBeam } from './dawn/LighthouseBeam';
import { WindowGlowDriver } from './dawn/WindowGlowDriver';
import { Waterway } from './water/Waterway';
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
          <MapOnly map="dawnvale">
            <Terrain map="dawnvale" />
          </MapOnly>
          <MapOnly map="glowmoss">
            <Terrain map="glowmoss" />
          </MapOnly>
          <MapOnly map="mirrorlake">
            <Terrain map="mirrorlake" />
          </MapOnly>
          <EnvironmentColliders index={index} />
          <BoundaryColliders map="dawnvale" />
          <BoundaryColliders map="glowmoss" />
          <BoundaryColliders map="mirrorlake" />
          <Player def={playerDef} colliderRef={playerCollider} />
          <OutdoorOnly>
            <Flocks />
          </OutdoorOnly>
          <Npcs />
          <Enemies />
          <BossArenas />
          <BuiltObjects />
          {cameraMode === 'follow' && !onTitle && <FollowCamera playerCollider={playerCollider} />}
        </Physics>
        <AssetBoundary name="world-placements">
          <WorldPlacements data={data} />
        </AssetBoundary>
        <MapOnly map="dawnvale">
          <GrassField index={index} map="dawnvale" />
          <Water />
          <MistWall map="dawnvale" />
          <Fireflies kind="fireflies" />
          <ChimneySmoke data={data} />
          <LighthouseBeam />
          <WindowGlowDriver />
        </MapOnly>
        <MapOnly map="glowmoss">
          <GrassField index={index} map="glowmoss" />
          <AssetBoundary name="waterway">
            <Waterway />
          </AssetBoundary>
          <MistWall map="glowmoss" />
          <Fireflies kind="spores" />
        </MapOnly>
        <MapOnly map="mirrorlake">
          <GrassField index={index} map="mirrorlake" />
          <Water map="mirrorlake" />
          <MistWall map="mirrorlake" />
        </MapOnly>
        <OutdoorOnly>
          <AssetBoundary name="backdrop">
            <Backdrop />
          </AssetBoundary>
        </OutdoorOnly>
        <InteractionSystem index={index} />
        <GameClock />
        <TutorialSystem />
        <MapTracker />
        <RegionTracker />
        <MapExplorer />
        <BoundaryWatcher />
        <PlayerCombat />
        <PlayerSpells />
        <CombatEffects />
        <MeleeEffects />
        <VfxSystem />
        <Companion />
        <BuildController />
        <ShaderWarmup />
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
