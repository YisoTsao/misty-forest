import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PLAYER_STATS } from '@/game-core/combat/combat';
import { combatRuntime } from '@/game/combat/combatRuntime';
import { sparkTexture } from '@/render/sparkTexture';

/** 星光衝擊（技能）：從腳下擴散的金色光環 + 向上飛散的星點。 */
function SkillBurst() {
  const ring = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Points>(null);
  const assets = useMemo(() => {
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 0.9), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    const count = 40;
    const pos = new Float32Array(count * 3);
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      dirs.push(new THREE.Vector3(Math.cos(a), 0.6 + (i % 5) * 0.25, Math.sin(a)));
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: new THREE.Color(2.4, 2.1, 1.2),
      size: 0.22,
      map: sparkTexture(),
      alphaTest: 0.02,
      transparent: true,
      toneMapped: false,
      depthWrite: false,
    });
    return { ringGeo, ringMat, sparkGeo, sparkMat, dirs };
  }, []);
  useEffect(
    () => () => {
      assets.ringGeo.dispose();
      assets.ringMat.dispose();
      assets.sparkGeo.dispose();
      assets.sparkMat.dispose();
    },
    [assets],
  );

  useFrame(() => {
    const fx = combatRuntime.skillFx;
    const visible = fx !== null && fx.age >= 0;
    if (ring.current) ring.current.visible = visible;
    if (sparks.current) sparks.current.visible = visible;
    if (!fx || !visible) return;
    const t = Math.min(1, fx.age / 0.6);
    const r = 0.4 + t * PLAYER_STATS.skill.radius;
    ring.current?.position.set(fx.x, fx.y - 0.7, fx.z);
    ring.current?.scale.setScalar(r);
    assets.ringMat.opacity = 1 - t;
    const pos = assets.sparkGeo.attributes.position as THREE.BufferAttribute;
    assets.dirs.forEach((d, i) => pos.setXYZ(i, fx.x + d.x * r * 0.9, fx.y - 0.6 + d.y * t * 1.6, fx.z + d.z * r * 0.9));
    pos.needsUpdate = true;
    assets.sparkMat.opacity = 1 - t;
  });

  return (
    <>
      <mesh ref={ring} geometry={assets.ringGeo} material={assets.ringMat} visible={false} renderOrder={2} />
      <points ref={sparks} geometry={assets.sparkGeo} material={assets.sparkMat} visible={false} frustumCulled={false} renderOrder={2} />
    </>
  );
}

/**
 * 傷害數字（規格 6.6）：把世界座標投影到畫面上，直接更新 #damage-layer 裡的 DOM（不經過 React state）。
 */
function DamageNumbers() {
  const { camera, size } = useThree();
  const nodes = useMemo(() => new Map<number, HTMLDivElement>(), []);
  const v = useMemo(() => new THREE.Vector3(), []);

  useEffect(
    () => () => {
      for (const el of nodes.values()) el.remove();
      nodes.clear();
    },
    [nodes],
  );

  useFrame(() => {
    const layer = document.getElementById('damage-layer');
    if (!layer) return;
    const alive = new Set<number>();
    for (const n of combatRuntime.damageNumbers) {
      alive.add(n.id);
      let el = nodes.get(n.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `damage-number ${n.target === 'player' ? 'damage-player' : 'damage-enemy'}`;
        el.textContent = String(Math.round(n.amount));
        el.dataset.testid = 'damage-number';
        layer.appendChild(el);
        nodes.set(n.id, el);
      }
      v.set(n.x, n.y + n.age * 0.9, n.z).project(camera);
      const hidden = v.z > 1;
      el.style.display = hidden ? 'none' : '';
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.25 - n.age) * 2})`;
      el.style.opacity = String(Math.min(1, (1.1 - n.age) * 3));
    }
    for (const [id, el] of nodes) {
      if (alive.has(id)) continue;
      el.remove();
      nodes.delete(id);
    }
  });
  return null;
}

export function CombatEffects() {
  return (
    <>
      <SkillBurst />
      <DamageNumbers />
    </>
  );
}
