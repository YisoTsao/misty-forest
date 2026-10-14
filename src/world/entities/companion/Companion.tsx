import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { isControllable } from '@/game-core/flow/gameFlow';
import { companionHint, companionRuntime } from '@/game/companion/companionRuntime';
import { input } from '@/game/input/inputManager';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { isModalOpen } from '@/game/state/uiStore';
import { patchMist } from '@/render/mist';
import { sparkTexture } from '@/render/sparkTexture';
import { toonGradient } from '@/render/toon';

/** 浮在玩家左後方肩膀上方的位置（玩家局部座標：+X 右、+Z 前） */
const OFFSET = new THREE.Vector3(-0.75, 1.55, -0.55);
const FOLLOW_RATE = 4;

/** 圓潤的五角星（擠出 + 倒角），正面朝 +Z */
function createStarGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.24 : 0.11;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 3, steps: 1 });
  geo.center();
  return geo;
}

/**
 * 星光夥伴「露米」（規格 5.2：跟隨玩家，位置不持久化；不做自主 AI）。
 * 平滑跟在玩家左後方、上下輕飄、偶爾轉一圈，身後拖著星點。按「詢問露米」會依進度給提示。
 */
export function Companion() {
  const unlocked = useGameStateStore((s) => s.state.companion.unlocked);
  if (!unlocked) return null;
  return <CompanionStar />;
}

function CompanionStar() {
  const group = useRef<THREE.Group>(null);
  const trail = useRef<THREE.Points>(null);
  const { camera, size } = useThree();
  const assets = useMemo(() => {
    const star = createStarGeometry();
    const starMat = patchMist(
      new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#ffe27a', emissive: new THREE.Color('#ffb52e'), emissiveIntensity: 0.9 }),
    );
    const eye = new THREE.SphereGeometry(0.028, 10, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#3b2a1a' });
    const blush = new THREE.CircleGeometry(0.03, 12);
    const blushMat = new THREE.MeshBasicMaterial({ color: '#ff9fb0', transparent: true, opacity: 0.8 });
    const count = 18;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const trailMat = new THREE.PointsMaterial({
      color: new THREE.Color(2.2, 1.9, 1.0),
      size: 0.1,
      map: sparkTexture(),
      alphaTest: 0.02,
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
      depthWrite: false,
    });
    return { star, starMat, eye, eyeMat, blush, blushMat, trailGeo, trailMat, count, head: 0, since: 0 };
  }, []);
  useEffect(
    () => () => {
      assets.star.dispose();
      assets.starMat.dispose();
      assets.eye.dispose();
      assets.eyeMat.dispose();
      assets.blush.dispose();
      assets.blushMat.dispose();
      assets.trailGeo.dispose();
      assets.trailMat.dispose();
    },
    [assets],
  );
  const target = useMemo(() => new THREE.Vector3(), []);
  const screen = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const g = group.current;
    if (!g) return;
    const rt = companionRuntime;
    const playing = isControllable(currentScreen());

    // 詢問露米
    if (input.consumePressed('companion') && playing && !isModalOpen()) companionHint();

    // 跟隨：玩家局部偏移轉到世界座標
    const { position, locomotion } = playerRuntime;
    const yaw = locomotion.facingYaw;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    target.set(position.x + OFFSET.x * cos + OFFSET.z * sin, position.y + OFFSET.y - 0.8, position.z - OFFSET.x * sin + OFFSET.z * cos);
    // 第一次出現，或玩家被傳送到遠處（地圖切換、讀檔）：直接放到玩家身邊，不從遠方飛過來
    if (!rt.placed || Math.hypot(target.x - rt.x, target.z - rt.z) > 40) {
      rt.x = target.x;
      rt.y = target.y;
      rt.z = target.z;
      rt.placed = true;
    }
    if (currentScreen() !== 'paused') {
      const k = 1 - Math.exp(-FOLLOW_RATE * dt);
      rt.x += (target.x - rt.x) * k;
      rt.y += (target.y - rt.y) * k;
      rt.z += (target.z - rt.z) * k;
      rt.appear = Math.min(1, rt.appear + dt / 1.2);
    }
    const t = clock.elapsedTime;
    const bob = Math.sin(t * 2.2) * 0.08;
    g.position.set(rt.x, rt.y + bob, rt.z);
    // 面向攝影機那一側（看得到臉），每隔幾秒開心地轉一圈
    const spin = (t % 7) < 0.8 ? ((t % 7) / 0.8) * Math.PI * 2 : 0;
    g.rotation.set(Math.sin(t * 1.3) * 0.15, Math.atan2(camera.position.x - rt.x, camera.position.z - rt.z) + spin, Math.sin(t * 1.7) * 0.2);
    // 出現：從小變大並帶一點彈性
    const a = rt.appear;
    g.scale.setScalar(a < 1 ? Math.sin(a * Math.PI * 0.5) * (1 + 0.25 * Math.sin(a * Math.PI)) : 1);

    // 星點拖尾：每隔一小段時間在目前位置留下一顆，慢慢往下飄
    assets.since += dt;
    const pos = assets.trailGeo.attributes.position as THREE.BufferAttribute;
    if (assets.since > 0.06) {
      assets.since = 0;
      pos.setXYZ(assets.head, rt.x + (Math.random() - 0.5) * 0.12, rt.y + bob - 0.05, rt.z + (Math.random() - 0.5) * 0.12);
      assets.head = (assets.head + 1) % assets.count;
    }
    for (let i = 0; i < assets.count; i++) pos.setY(i, pos.getY(i) - dt * 0.25);
    pos.needsUpdate = true;

    // 對話泡泡跟著露米（DOM 由 CompanionBubble 渲染，這裡只更新位置）
    const bubble = document.getElementById('companion-bubble');
    if (bubble) {
      screen.set(rt.x, rt.y + bob + 0.45, rt.z).project(camera);
      bubble.style.transform = `translate(${((screen.x + 1) / 2) * size.width}px, ${((1 - screen.y) / 2) * size.height}px) translate(-50%, -100%)`;
      bubble.style.visibility = screen.z > 1 ? 'hidden' : 'visible';
    }
  });

  return (
    <>
      <group ref={group} name="companion">
        <mesh geometry={assets.star} material={assets.starMat} />
        <mesh geometry={assets.eye} material={assets.eyeMat} position={[-0.055, 0.02, 0.08]} />
        <mesh geometry={assets.eye} material={assets.eyeMat} position={[0.055, 0.02, 0.08]} />
        <mesh geometry={assets.blush} material={assets.blushMat} position={[-0.1, -0.03, 0.081]} />
        <mesh geometry={assets.blush} material={assets.blushMat} position={[0.1, -0.03, 0.081]} />
      </group>
      <points ref={trail} geometry={assets.trailGeo} material={assets.trailMat} frustumCulled={false} />
    </>
  );
}
