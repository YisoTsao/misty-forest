import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { WorldData } from '@/game-core/world/worldData';
import { patchMist } from '@/render/mist';
import { toonGradient } from '@/render/toon';

/** 每個煙囪同時存在的煙團數與一團的壽命（秒） */
const PUFFS = 7;
const LIFE = 5.6;
/** 煙團上升的速度與被風吹往的方向（與草的陣風大致同向） */
const RISE = 0.55;
const WIND = new THREE.Vector3(0.32, 0, -0.18);
const HIGH_COLOR = new THREE.Color('#c9d6df');

/**
 * 炊煙（規格 4.3 環境動畫）：prefab 標記了 `smoke`（煙囪頂端）的建築冒出一串低面數的煙團，
 * 上升、變大、被風吹斜，最後縮小消失（不用半透明，避免排序問題，與畫面的卡通風格一致）。
 */
export function ChimneySmoke({ data }: { data: WorldData }) {
  const emitters = useMemo(() => {
    const out: THREE.Vector3[] = [];
    const m = new THREE.Matrix4();
    for (const p of data.placements) {
      const smoke = data.prefabs.get(p.prefabId)?.smoke;
      if (!smoke) continue;
      m.compose(
        new THREE.Vector3(...p.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(...(p.scale ?? [1, 1, 1])),
      );
      out.push(new THREE.Vector3(...smoke).applyMatrix4(m));
    }
    return out;
  }, [data]);

  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(0.42, 1);
    const material = patchMist(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), color: '#f3f1ec' }));
    return { geometry, material };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), c: new THREE.Color(), e: new THREE.Euler() }), []);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    emitters.forEach((origin, e) => {
      for (let k = 0; k < PUFFS; k++) {
        // 每團錯開出生時間，循環使用
        const age = (t + (k / PUFFS) * LIFE + e * 1.3) % LIFE;
        const u = age / LIFE;
        const sway = Math.sin(t * 0.7 + k * 2.1 + e) * 0.25 * u;
        tmp.p.set(origin.x + WIND.x * age * u + sway, origin.y + RISE * age, origin.z + WIND.z * age * u);
        // 冒出時迅速長大，之後慢慢變大，最後縮小消失
        const size = Math.min(1, u * 6) * (0.45 + u * 1.1) * (1 - Math.max(0, (u - 0.75) / 0.25));
        tmp.s.setScalar(Math.max(0.001, size));
        tmp.q.setFromEuler(tmp.e.set(k, u * 2 + k, 0));
        mesh.setMatrixAt(e * PUFFS + k, tmp.m.compose(tmp.p, tmp.q, tmp.s));
        // 越高越淡（顏色往天空的淺灰藍靠）
        mesh.setColorAt(e * PUFFS + k, tmp.c.setRGB(1, 1, 1).lerp(HIGH_COLOR, u * 0.8));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (emitters.length === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, emitters.length * PUFFS]} frustumCulled={false} />;
}
