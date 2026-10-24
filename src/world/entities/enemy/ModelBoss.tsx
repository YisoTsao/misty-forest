import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BossState } from '@/game-core/combat/bossAi';
import type { BossDef, EnemyDef } from '@/game-core/combat/combat';
import { updateBossAi } from '@/game/combat/bossRuntime';
import { enemyRuntime, enemyY, removeEnemyVisual } from '@/game/combat/combatRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import { assetUrl } from '@/game/worldData';
import { GroundMarks, type GroundMark } from './GroundMarks';
import { buildEnemyModel } from './ModelEnemy';

type ModelBossDef = EnemyDef & { boss: BossDef; model: NonNullable<EnemyDef['model']> };
const FADE_IN_SEC = 1.0;
const VANISH_SEC = 2.4;
const CROSSFADE = 0.18;
/** 預警標記最多幾個（根刺第二階段、霧球） */
const MAX_MARKS = 8;
/** 衝撞的路線用幾個圓表示 */
const LANE_MARKS = 4;
/** 蓄力中的狀態：播放出手動作、身體轉紅 */
const WINDUPS: readonly BossState[] = ['spikes', 'slam', 'spores', 'charge', 'orbs'];
const tmpColor = new THREE.Color();
const PURIFY = new THREE.Color('#c9a0ff');
const GOLD = new THREE.Color('#ffd77a');

/**
 * 以模型呈現、沒有專屬造型的頭目（第二章的根噬者，placeholder 模型）：推進頭目 AI（bossRuntime）、依狀態切換骨架動畫，
 * 畫出各招式的地面預警。蓄力時身體轉紅、被打到閃白、淨化中金紫交錯地發光，倒下後播放倒地動畫再淡出。
 */
export function ModelBoss({ id, def }: { id: string; def: ModelBossDef }) {
  const gltf = useGLTF(assetUrl(def.model.path));
  const { root, materials } = useMemo(() => buildEnemyModel(gltf.scene, def.model.colors), [gltf.scene, def.model.colors]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const scale = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    return def.model.height / Math.max(0.01, new THREE.Box3().setFromObject(gltf.scene).max.y);
  }, [gltf.scene, def.model.height]);

  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  const actions = useMemo(() => {
    const byName = new Map(gltf.animations.map((c) => [c.name, c]));
    const pick = (name: string | undefined) => {
      const clip = name ? byName.get(name) : undefined;
      return clip ? mixer.clipAction(clip) : null;
    };
    const clips = def.model.clips;
    const a = { idle: pick(clips.idle), move: pick(clips.move), attack: pick(clips.attack), hit: pick(clips.hit), death: pick(clips.death) };
    for (const once of [a.attack, a.hit, a.death]) {
      if (!once) continue;
      once.setLoop(THREE.LoopOnce, 1);
      once.clampWhenFinished = true;
    }
    return a;
  }, [gltf.animations, mixer, def.model.clips]);
  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  const group = useRef<THREE.Group>(null);
  const rb = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const ignoredHandle = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (ignoredHandle.current !== null) cameraIgnoredColliders.delete(ignoredHandle.current);
    },
    [],
  );
  const local = useMemo(() => ({ current: null as THREE.AnimationAction | null, state: null as BossState | null, lastFlash: 0, time: 0, deathStarted: false }), []);
  const play = (next: THREE.AnimationAction | null, restart = false) => {
    if (!next || (local.current === next && !restart)) return;
    next.reset().setEffectiveWeight(1).fadeIn(CROSSFADE).play();
    if (local.current && local.current !== next) local.current.fadeOut(CROSSFADE);
    local.current = next;
  };

  useFrame(({ camera }, rawDt) => {
    const v = enemyRuntime.get(id);
    const g = group.current;
    const b = v?.boss;
    if (!v || !b || !g) return;
    g.visible = Math.hypot(camera.position.x - v.ai.x, camera.position.z - v.ai.z) < 120;
    if (ignoredHandle.current === null && collider.current) {
      ignoredHandle.current = collider.current.handle;
      cameraIgnoredColliders.add(ignoredHandle.current);
    }
    const dt = Math.min(rawDt, 1 / 20);
    const paused = currentScreen() === 'paused';
    const ai = v.ai;
    updateBossAi(id, v, def, dt);
    if (!paused) {
      local.time += dt;
      v.fadeIn = Math.min(1, v.fadeIn + dt / FADE_IN_SEC);
      v.flash = Math.max(0, v.flash - dt);
    }

    // ── 動畫：狀態改變時切換；蓄力的招式各播一次出手動作 ──
    const st = b.state;
    if (v.vanishing !== null) {
      if (!local.deathStarted) {
        local.deathStarted = true;
        play(actions.death ?? actions.idle, true);
      }
    } else if (st !== local.state) {
      if (WINDUPS.includes(st)) play(actions.attack ?? actions.idle, true);
      else if (st === 'chase' || st === 'dash' || st === 'air') play(actions.move ?? actions.idle);
      else if (st === 'stunned') play(actions.hit ?? actions.idle, true);
      else play(actions.idle);
    } else if (v.flash > local.lastFlash && st === 'chase') {
      play(actions.hit ?? actions.move, true);
    } else if (local.current === actions.hit && !actions.hit?.isRunning() && st === 'chase') {
      play(actions.move ?? actions.idle);
    }
    local.state = st;
    local.lastFlash = v.flash;
    if (!paused) mixer.update(dt);

    // ── 外觀：淡入、蓄力轉紅、被打到閃白、淨化中金紫交錯、倒下後淡出 ──
    let opacity = v.fadeIn;
    if (v.vanishing !== null) {
      if (!paused) v.vanishing += dt;
      const k = Math.min(1, v.vanishing / VANISH_SEC);
      opacity *= 1 - Math.max(0, (k - 0.6) / 0.4);
      if (k >= 1) {
        removeEnemyVisual(id);
        return;
      }
    }
    const windup = WINDUPS.includes(st) ? Math.min(1, b.timer / windupOf(def.boss, st)) : 0;
    if (v.flash > 0) tmpColor.setRGB(0.85, 0.85, 0.85);
    else if (st === 'purify') tmpColor.copy(PURIFY).lerp(GOLD, 0.5 + 0.5 * Math.sin(local.time * 3)).multiplyScalar(0.55);
    else tmpColor.setRGB(0.4 * windup, 0.1 * windup, 0.08 * windup);
    for (const m of materials) {
      m.opacity = opacity;
      m.depthWrite = opacity > 0.98;
      m.emissive.copy(tmpColor);
    }

    // 跳躍震地：沿拋物線跳到落點
    let lift = 0;
    if (st === 'air' && def.boss.moves.slam) {
      const k = Math.min(1, b.timer / def.boss.moves.slam.air);
      lift = 4 * 2.4 * k * (1 - k);
    }
    const ground = enemyY(ai.x, ai.z);
    g.position.set(ai.x, ground + lift, ai.z);
    g.rotation.y = ai.yaw;
    g.scale.setScalar(scale * (0.7 + 0.3 * v.fadeIn));
    if (v.vanishing === null) rb.current?.setNextKinematicTranslation({ x: ai.x, y: ground + lift + def.model.radius, z: ai.z });
    else rb.current?.setNextKinematicTranslation({ x: ai.x, y: -100, z: ai.z });
  });

  const v = enemyRuntime.get(id);
  const start: [number, number, number] = v ? [v.ai.x, enemyY(v.ai.x, v.ai.z), v.ai.z] : [0, -100, 0];
  return (
    <>
      <RigidBody ref={rb} type="kinematicPosition" colliders={false} position={start}>
        <BallCollider ref={collider} args={[def.model.radius]} />
      </RigidBody>
      <group ref={group} position={start} name={`enemy:${id}`}>
        <primitive object={root} />
      </group>
      <GroundMarks count={MAX_MARKS + LANE_MARKS} marks={() => bossMarks(id, def.boss)} />
    </>
  );
}

function windupOf(boss: BossDef, st: BossState): number {
  const m = boss.moves;
  const w = st === 'spikes' ? m.spikes?.windup : st === 'slam' ? m.slam?.windup : st === 'spores' ? m.spores?.windup : st === 'charge' ? m.charge?.windup : st === 'orbs' ? m.orbs?.windup : undefined;
  return Math.max(0.01, w ?? 1);
}

const marksOut: GroundMark[] = [];

/** 頭目目前招式的地面預警（根刺 / 霧球的標記、震地的落點、衝撞的路線） */
export function bossMarks(id: string, boss: BossDef): readonly GroundMark[] {
  marksOut.length = 0;
  const b = enemyRuntime.get(id)?.boss;
  if (!b) return marksOut;
  const m = boss.moves;
  const progress = Math.min(1, b.timer / windupOf(boss, b.state));
  if (b.state === 'spikes' && m.spikes) for (const p of b.markers.slice(0, MAX_MARKS)) marksOut.push({ ...p, radius: m.spikes.radius, progress });
  if (b.state === 'orbs' && m.orbs) for (const p of b.markers.slice(0, MAX_MARKS)) marksOut.push({ ...p, radius: m.orbs.radius, progress });
  if ((b.state === 'slam' || b.state === 'air') && m.slam) {
    const k = b.state === 'slam' ? 0.5 * progress : 0.5 + 0.5 * Math.min(1, b.timer / m.slam.air);
    marksOut.push({ ...b.slamTo, radius: m.slam.radius, progress: k });
  }
  if (b.state === 'charge' && m.charge) {
    const ai = enemyRuntime.get(id)!.ai;
    for (let i = 1; i <= LANE_MARKS; i++) {
      const d = (m.charge.distance * i) / LANE_MARKS;
      marksOut.push({ x: ai.x + Math.sin(ai.yaw) * d, z: ai.z + Math.cos(ai.yaw) * d, radius: m.charge.radius, progress });
    }
  }
  return marksOut;
}
