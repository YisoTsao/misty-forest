import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { moveClips, weaponIds, type WeaponId } from '@/game-core/combat/weapons';
import type { RemoteActionMessage } from '@/game-core/net/protocol';
import { spells, weapons } from '@/game/authority';
import { getCharacterDef, PLAYER_CHARACTER_ID } from '@/game/character/characters';
import type { TrailSample } from '@/game/combat/combatRuntime';
import { t } from '@/game/i18n';
import { useLocationStore } from '@/game/location';
import { assetUrl } from '@/game/worldData';
import { remotePose, remotePresentTime, remoteRuntime, takeDueActions, useNetStore } from '@/net/netStore';
import { AssetBoundary } from '../../AssetBoundary';
import { WeaponTrail } from '../../combat/MeleeEffects';
import { remoteSpell } from '../../combat/PlayerSpells';
import { attachWeapons, prepareModel, SWORD_SOURCE, TRAIL_LIFE, WAND_SOURCE, type HeldId } from './CharacterModel';

const def = getCharacterDef(PLAYER_CHARACTER_ID);
const FOOT_OFFSET = def.capsule.halfHeight + def.capsule.radius;
const FADE = 0.15;
/** 近戰招式之間切換較快（與本機 CharacterModel 相同） */
const MOVE_FADE = 0.08;
/** 只播一次並停在最後一格：跳躍、落地與所有近戰招式 */
const ONE_SHOT = new Set([def.clips.jump, def.clips.land, ...moveClips(weapons)]);
/** 名牌只在這個距離內顯示（m） */
const LABEL_DISTANCE = 35;

/** 正在播放的一次性動作（對方時間軸上的毫秒） */
type ActiveAction = { key: number; clip: string; speed: number; endT: number; held: HeldId; melee: WeaponId | null; spell: string | null };

const tmpTip = new THREE.Vector3();
const tmpBase = new THREE.Vector3();
let nextActionKey = 1;

/**
 * 其他玩家（任務 11A / 11B）：依 netStore 的名單生成 / 移除，每幀取對方時間軸上「現在 − 呈現延遲」的插值姿勢。
 * 沒有物理（碰撞由各自的客戶端處理，決策 T-168），只顯示同一張地圖、同一個室內的人。
 * 對方斷線、伺服器保留座位時停在原地，名牌變淡並標示「連線不穩」（任務 11C）。
 * 攻擊與施法（任務 11E）：手上顯示對方的武器；動作在呈現到它發生的那一刻才播放（與位置對齊），
 * 近戰播放招式動畫與揮砍拖尾，施法拿魔杖並在對方位置畫出魔法特效（只是表現，不命中本機的敵人）。
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
  const swordGltf = useGLTF(assetUrl(SWORD_SOURCE));
  const wandGltf = useGLTF(assetUrl(WAND_SOURCE));
  const { root, materials } = useMemo(() => prepareModel(gltf.scene, def.hiddenNodes), [gltf.scene]);
  const weaponModels = useMemo(() => attachWeapons(root, swordGltf.scene, wandGltf.scene), [root, swordGltf.scene, wandGltf.scene]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useEffect(() => () => weaponModels.materials.forEach((m) => m.dispose()), [weaponModels]);
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Group>(null);
  const { actions } = useAnimations(gltf.animations, modelRef);
  const playing = useRef<{ clip: string; key: number } | null>(null);
  const active = useRef<ActiveAction | null>(null);
  const shown = useRef<HeldId | null>(null);
  const trail = useMemo(() => ({ samples: [] as TrailSample[], weapon: 'sword' as WeaponId }), []);
  const trailSource = useMemo(() => () => trail, [trail]);

  useEffect(() => {
    for (const clip of ONE_SHOT) {
      const action = actions[clip];
      action?.setLoop(THREE.LoopOnce, 1);
      if (action) action.clampWhenFinished = true;
    }
  }, [actions]);

  useFrame(({ camera }, dt) => {
    const group = groupRef.current;
    const entry = remoteRuntime.players.get(sessionId);
    if (!group) return;
    const loc = useLocationStore.getState();
    const now = performance.now();
    const pose = entry ? remotePose(entry, now) : null;
    const visible = !!entry && !!pose && entry.view.map === loc.map && entry.view.location === loc.location;
    group.visible = visible;

    // 呈現時間到了的動作：開始播放；看不到對方時只取走，不畫特效
    const present = entry ? remotePresentTime(entry, now) : null;
    if (entry && present !== null) {
      for (const msg of takeDueActions(entry, present)) {
        startAction(msg, visible && pose ? { x: pose.x, y: pose.y - FOOT_OFFSET, z: pose.z } : null);
        remoteRuntime.actionsPlayed++;
      }
    }
    if (active.current && (present === null || present >= active.current.endT)) active.current = null;
    const act = active.current;

    const label = labelRef.current;
    if (!visible || !entry || !pose) {
      // Html 名牌是 DOM，不會跟著 group.visible 隱藏
      if (label) label.style.display = 'none';
      trail.samples.length = 0;
      return;
    }
    group.position.set(pose.x, pose.y - FOOT_OFFSET, pose.z);
    group.rotation.y = pose.yaw;

    // 手上：施法時拿魔杖、出招時拿那一招的武器，否則是對方裝備的武器
    const equipped = (weaponIds as readonly string[]).includes(entry.view.weapon) ? (entry.view.weapon as WeaponId) : 'fist';
    const held: HeldId = act?.held ?? equipped;
    if (shown.current !== held) {
      for (const list of Object.values(weaponModels.nodes)) for (const o of list) o.visible = false;
      for (const o of weaponModels.nodes[held]) o.visible = true;
      shown.current = held;
    }

    const clip = act?.clip ?? def.clips[entry.view.anim];
    const key = act?.key ?? 0;
    if (clip !== playing.current?.clip || key !== playing.current.key) {
      const next = actions[clip];
      const prev = playing.current ? actions[playing.current.clip] : undefined;
      if (next) {
        const fade = act?.melee ? MOVE_FADE : FADE;
        next.reset();
        next.setEffectiveTimeScale(act?.speed ?? 1);
        next.setEffectiveWeight(1).fadeIn(prev ? fade : 0).play();
        if (prev && prev !== next) prev.fadeOut(fade);
        playing.current = { clip, key };
      }
    }
    entry.shown = { clip, held };
    recordTrail(act, dt);
    if (label) label.style.display = camera.position.distanceTo(group.position) < LABEL_DISTANCE ? '' : 'none';
  });

  /** 開始一個動作；feet 為 null 表示對方不在畫面上（不畫特效） */
  function startAction(msg: RemoteActionMessage, feet: { x: number; y: number; z: number } | null): void {
    if (msg.kind === 'melee') {
      const found = weapons.moves.get(msg.move);
      if (!found) return;
      const { move, weapon } = found;
      active.current = { key: nextActionKey++, clip: move.clip, speed: move.speed, endT: msg.t + move.duration * 1000, held: weapon, melee: weapon, spell: null };
      return;
    }
    const spell = spells.get(msg.spell);
    if (!spell) return;
    const target = msg.tx !== undefined && msg.tz !== undefined ? { x: msg.tx, z: msg.tz } : undefined;
    if (msg.phase === 'cast') {
      active.current = { key: nextActionKey++, clip: spell.clips.cast, speed: 1, endT: msg.t + spell.duration * 1000, held: 'wand', melee: null, spell: spell.id };
    } else {
      // 發動：接在蓄力之後換成發動動作（漏掉蓄力時從這裡開始）
      const castingThis = active.current?.spell === spell.id;
      const endT = castingThis ? active.current!.endT : msg.t + (spell.duration - spell.castTime) * 1000;
      active.current = { key: nextActionKey++, clip: spell.clips.release, speed: 1, endT, held: 'wand', melee: null, spell: spell.id };
    }
    if (feet) remoteSpell(spell, msg.phase, feet, msg.yaw, target);
  }

  /** 刀、劍揮砍時記錄刀尖與刀柄的世界座標（與本機 CharacterModel 相同） */
  function recordTrail(act: ActiveAction | null, dt: number): void {
    const samples = trail.samples;
    for (const s of samples) s.age += dt;
    while (samples.length > 0 && samples[0]!.age > TRAIL_LIFE) samples.shift();
    const blade = act?.melee ? weaponModels.blade[act.melee] : undefined;
    if (!act?.melee || !blade) return;
    trail.weapon = act.melee;
    blade.object.updateWorldMatrix(true, false);
    tmpTip.copy(blade.tip).applyMatrix4(blade.object.matrixWorld);
    tmpBase.copy(blade.base).applyMatrix4(blade.object.matrixWorld);
    samples.push({ tip: [tmpTip.x, tmpTip.y, tmpTip.z], base: [tmpBase.x, tmpBase.y, tmpBase.z], age: 0 });
    if (samples.length > 32) samples.shift();
  }

  return (
    <>
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
      <WeaponTrail source={trailSource} />
    </>
  );
}
