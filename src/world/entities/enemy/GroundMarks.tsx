import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { enemyY } from '@/game/combat/combatRuntime';

/** 一個地面預警標記：位置、半徑、蓄力進度（0 → 1，內圈由小變大，滿了就出手） */
export type GroundMark = { x: number; z: number; radius: number; progress: number };

/**
 * 招式的地面預警（Bible §11.2 攻擊預兆）：外圈是範圍，內圈隨蓄力長大到外圈時出手。
 * 固定數量的標記，每幀由 marks() 提供目前要顯示的（多出來的隱藏）；模型頭目與枯根守衛共用。
 */
export function GroundMarks({ count, marks, color = '#ff7a4d', ring = '#ffb36b' }: { count: number; marks: () => readonly GroundMark[]; color?: string; ring?: string }) {
  const res = useMemo(() => {
    const ringGeo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: ring, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    for (const m of [ringMat, fillMat]) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
    }
    return { ringGeo, discGeo, ringMat, fillMat };
  }, [color, ring]);
  useEffect(
    () => () => {
      res.ringGeo.dispose();
      res.discGeo.dispose();
      res.ringMat.dispose();
      res.fillMat.dispose();
    },
    [res],
  );
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const list = marks();
    g.children.forEach((mark, i) => {
      const m = list[i];
      mark.visible = m !== undefined;
      if (!m) return;
      mark.position.set(m.x, enemyY(m.x, m.z) + 0.06, m.z);
      mark.scale.setScalar(m.radius);
      mark.children[1]!.scale.setScalar(Math.max(0.01, Math.min(1, m.progress)));
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} visible={false}>
          <mesh geometry={res.ringGeo} material={res.ringMat} renderOrder={2} />
          <mesh geometry={res.discGeo} material={res.fillMat} renderOrder={2} />
        </group>
      ))}
    </group>
  );
}
