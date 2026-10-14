import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { EnemyDef } from '@/game-core/combat/combat';
import { combat } from '@/game/authority';
import { enemyRuntime, enemyY, removeEnemyVisual } from '@/game/combat/combatRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { cameraIgnoredColliders } from '@/game/world/cameraIgnore';
import { assetUrl } from '@/game/worldData';
import { toToonMaterial } from '@/render/toon';
import { updateEnemyAi } from './enemyUpdate';

type ModelDef = EnemyDef & { model: NonNullable<EnemyDef['model']> };
const FADE_IN_SEC = 1.0;
const VANISH_SEC = 1.6;
const CROSSFADE = 0.18;
/** 攝影機超過這個距離就不畫、也不更新骨架動畫（怪物不剔除視錐，遠處的要自己隱藏） */
const VISIBLE_DISTANCE = 90;
const tmpColor = new THREE.Color();

/** 每種模型只量一次：模型頂端的高度（模型單位），換算成資料指定的身高 */
const modelTop = new Map<string, number>();
function topOf(scene: THREE.Object3D, key: string): number {
  const cached = modelTop.get(key);
  if (cached !== undefined) return cached;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const top = Math.max(0.01, box.max.y);
  modelTop.set(key, top);
  return top;
}

/** 複製模型並換成這隻怪物自己的 toon 材質（閃白、透明度各自獨立）；ModelEnemy 與 shader 預熱共用 */
export function buildEnemyModel(scene: THREE.Object3D, colors: Record<string, string> = {}) {
  const root = cloneSkinned(scene);
  const materials: THREE.MeshToonMaterial[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!source) return;
    const toon = toToonMaterial(source);
    // 依材質換色（綠色史萊姆 → 淡紫的霧凝史萊姆）；素材的眼白偏灰，一律換成白色
    const hex = colors[source.name] ?? (source.name === 'Eye_White' ? '#ffffff' : undefined);
    if (hex) toon.color.set(hex);
    toon.transparent = true;
    toon.emissive = new THREE.Color(0, 0, 0);
    obj.material = toon;
    materials.push(toon);
    obj.castShadow = true;
    obj.frustumCulled = false;
  });
  return { root, materials };
}

/**
 * shader 預熱用（ShaderWarmup）：一份不動的模型，載入後畫一次就卸載。
 * 材質刻意不 dispose：three 的 program 有參考計數，沒有材質在用時就會刪掉，預熱編好的 program 會在第一次遇到怪物前就沒了
 */
export function ModelEnemyWarmup({ def }: { def: ModelDef }) {
  const gltf = useGLTF(assetUrl(def.model.path));
  const { root } = useMemo(() => buildEnemyModel(gltf.scene, def.model.colors), [gltf.scene, def.model.colors]);
  return <primitive object={root} />;
}

/**
 * 以 3D 模型呈現的怪物（任務 7C；Quaternius Ultimate Monsters，CC0）：骨架動畫依 AI 狀態切換
 * （待機 / 移動 / 攻擊 / 受擊 / 倒下），被擊中閃白、生成時淡入、倒下後播放倒地動畫再淡出。
 * 每隻有自己的材質（閃白、透明度），幾何與骨架動畫片段共用。
 */
export function ModelEnemy({ id, def }: { id: string; def: ModelDef }) {
  const gltf = useGLTF(assetUrl(def.model.path));
  const scale = def.model.height / topOf(gltf.scene, def.model.path);
  const { root, materials } = useMemo(() => buildEnemyModel(gltf.scene, def.model.colors), [gltf.scene, def.model.colors]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

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
  useEffect(
    () => () => {
      mixer.stopAllAction();
    },
    [mixer],
  );

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
  const local = useMemo(() => ({ current: null as THREE.AnimationAction | null, lastFlash: 0, hitUntil: 0, time: 0, deathStarted: false }), []);

  const play = (next: THREE.AnimationAction | null, restart = false) => {
    if (!next || (local.current === next && !restart)) return;
    next.reset().setEffectiveWeight(1).fadeIn(CROSSFADE).play();
    if (local.current && local.current !== next) local.current.fadeOut(CROSSFADE);
    local.current = next;
  };

  useFrame(({ camera }, rawDt) => {
    const v = enemyRuntime.get(id);
    const g = group.current;
    if (!v || !g) return;
    const near = Math.hypot(camera.position.x - v.ai.x, camera.position.z - v.ai.z) < VISIBLE_DISTANCE;
    g.visible = near;
    if (ignoredHandle.current === null && collider.current) {
      ignoredHandle.current = collider.current.handle;
      cameraIgnoredColliders.add(ignoredHandle.current);
    }
    const spawner = combat.spawners.find((s) => s.id === v.spawner);
    if (!spawner) return;
    const dt = Math.min(rawDt, 1 / 20);
    const paused = currentScreen() === 'paused';
    const ai = v.ai;
    const winding = ai.state === 'attack' || ai.state === 'spit';
    const windup = ai.state === 'spit' && def.behavior?.kind === 'spit' ? def.behavior.windup : def.attackWindup;
    updateEnemyAi(id, v, def, spawner, dt);

    if (!paused) {
      local.time += dt;
      v.fadeIn = Math.min(1, v.fadeIn + dt / FADE_IN_SEC);
      v.flash = Math.max(0, v.flash - dt);
    }

    v.anim = local.current?.getClip().name;
    // 動畫：倒下 > 受擊 > 攻擊前搖 > 移動 > 待機
    if (v.vanishing !== null) {
      if (!local.deathStarted) {
        local.deathStarted = true;
        play(actions.death ?? actions.hit, true);
      }
    } else if (v.flash > local.lastFlash + 0.05) {
      // 新的一次命中（flash 被重設成較大的值）
      local.hitUntil = local.time + 0.3;
      play(actions.hit, true);
    } else if (local.time < local.hitUntil) {
      // 受擊動作播完
    } else if (winding) {
      // 攻擊與吐泥（迷霧芽怪，任務 8B）共用攻擊動作
      if (local.current !== actions.attack) {
        play(actions.attack, true);
        // 攻擊動作的出手點對齊前搖結束
        if (actions.attack) actions.attack.timeScale = Math.max(0.6, Math.min(2, (actions.attack.getClip().duration * 0.45) / Math.max(windup, 0.2)));
      }
    } else if (ai.state === 'chase' || ai.state === 'patrol' || ai.state === 'return') {
      play(actions.move ?? actions.idle);
      if (actions.move) actions.move.timeScale = ai.state === 'patrol' ? 0.75 : 1.1;
    } else {
      play(actions.idle);
    }
    local.lastFlash = v.flash;

    if (!paused && near) mixer.update(dt);

    // 外觀：淡入、閃白、倒下後淡出
    let opacity = v.fadeIn;
    if (v.vanishing !== null) {
      if (!paused) v.vanishing += dt;
      const t = Math.min(1, v.vanishing / VANISH_SEC);
      opacity *= 1 - Math.max(0, (t - 0.55) / 0.45);
      if (t >= 1) {
        removeEnemyVisual(id);
        return;
      }
    }
    const flash = v.flash > 0 ? 0.85 : winding ? 0.35 * Math.min(1, ai.timer / Math.max(windup, 0.01)) : 0;
    tmpColor.setRGB(flash, flash * (winding && v.flash <= 0 ? 0.25 : 1), flash * (winding && v.flash <= 0 ? 0.2 : 1));
    for (const m of materials) {
      m.opacity = opacity;
      m.depthWrite = opacity > 0.98;
      m.emissive.copy(tmpColor);
    }

    const bob = def.model.hover ? Math.sin(local.time * 2.4) * 0.12 : 0;
    const y = enemyY(ai.x, ai.z) + (def.model.hover ?? 0) + bob;
    g.position.set(ai.x, y, ai.z);
    g.rotation.y = ai.yaw;
    g.scale.setScalar(scale * (0.7 + 0.3 * v.fadeIn));
    const bodyY = enemyY(ai.x, ai.z) + def.model.radius + (def.model.hover ?? 0) * 0.5;
    if (v.vanishing === null) rb.current?.setNextKinematicTranslation({ x: ai.x, y: bodyY, z: ai.z });
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
    </>
  );
}
