import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getCharacterDef, PLAYER_CHARACTER_ID } from '@/game/character/characters';
import { t } from '@/game/i18n';
import { useLocationStore } from '@/game/location';
import { assetUrl } from '@/game/worldData';
import { remotePose, remoteRuntime, useNetStore } from '@/net/netStore';
import { AssetBoundary } from '../../AssetBoundary';
import { prepareModel } from './CharacterModel';

const def = getCharacterDef(PLAYER_CHARACTER_ID);
const FOOT_OFFSET = def.capsule.halfHeight + def.capsule.radius;
const FADE = 0.15;
const ONE_SHOT = new Set([def.clips.jump, def.clips.land]);
/** 名牌只在這個距離內顯示（m） */
const LABEL_DISTANCE = 35;

/**
 * 其他玩家（任務 11A / 11B）：依 netStore 的名單生成 / 移除，每幀取對方時間軸上「現在 − 100 ms」的插值姿勢。
 * 沒有物理（碰撞由各自的客戶端處理，決策 T-168），只顯示同一張地圖、同一個室內的人。
 * 對方斷線、伺服器保留座位時停在原地，名牌變淡並標示「連線不穩」（任務 11C）。
 */
export function RemotePlayers() {
  const members = useNetStore((s) => s.members);
  return (
    <>
      {members.map((m) => (
        <AssetBoundary key={m.sessionId} name={`remote-player:${m.sessionId}`}>
          <RemotePlayer sessionId={m.sessionId} name={m.name} online={m.online} />
        </AssetBoundary>
      ))}
    </>
  );
}

function RemotePlayer({ sessionId, name, online }: { sessionId: string; name: string; online: boolean }) {
  const gltf = useGLTF(assetUrl(def.model));
  const { root, materials } = useMemo(() => prepareModel(gltf.scene, def.hiddenNodes), [gltf.scene]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Group>(null);
  const { actions } = useAnimations(gltf.animations, modelRef);
  const playing = useRef<string | null>(null);

  useEffect(() => {
    for (const clip of ONE_SHOT) {
      const action = actions[clip];
      action?.setLoop(THREE.LoopOnce, 1);
      if (action) action.clampWhenFinished = true;
    }
  }, [actions]);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    const entry = remoteRuntime.players.get(sessionId);
    if (!group) return;
    const loc = useLocationStore.getState();
    const pose = entry ? remotePose(entry, performance.now()) : null;
    const visible = !!entry && !!pose && entry.view.map === loc.map && entry.view.location === loc.location;
    group.visible = visible;
    const label = labelRef.current;
    if (!visible || !entry || !pose) {
      // Html 名牌是 DOM，不會跟著 group.visible 隱藏
      if (label) label.style.display = 'none';
      return;
    }
    group.position.set(pose.x, pose.y - FOOT_OFFSET, pose.z);
    group.rotation.y = pose.yaw;

    const clip = def.clips[entry.view.anim];
    if (clip !== playing.current) {
      const next = actions[clip];
      const prev = playing.current ? actions[playing.current] : undefined;
      if (next) {
        next.reset().setEffectiveWeight(1).fadeIn(prev ? FADE : 0).play();
        if (prev && prev !== next) prev.fadeOut(FADE);
        playing.current = clip;
      }
    }
    if (label) label.style.display = camera.position.distanceTo(group.position) < LABEL_DISTANCE ? '' : 'none';
  });

  return (
    <group ref={groupRef} visible={false} userData={{ remotePlayer: sessionId }}>
      <group ref={modelRef} scale={def.scale}>
        <primitive object={root} />
      </group>
      <Html position={[0, 1.75, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div
          ref={labelRef}
          data-testid="remote-name"
          data-online={online}
          className={`whitespace-nowrap rounded-full bg-black/50 px-2 py-0.5 text-xs font-bold shadow ${online ? 'text-white' : 'text-white/50'}`}
        >
          {online ? name : `${name} ${t('net.remoteUnstable')}`}
        </div>
      </Html>
    </group>
  );
}
