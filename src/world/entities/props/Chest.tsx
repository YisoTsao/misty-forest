import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Placement } from '@/game-core/world/types';
import { useWorldStore } from '@/game/state/worldStore';
import { assetUrl } from '@/game/worldData';
import { toToonMaterial } from '@/render/toon';

const LID_NODE = 'chest_lid';
/** 開蓋角度（弧度，往後掀） */
const OPEN_ANGLE = -1.95;
/** 角色互動動畫伸手的時間點，蓋子在這之後才掀開 */
const OPEN_DELAY = 0.35;

/**
 * 寶箱（規格 5.2：碰撞、可互動、持久化開關狀態）。
 * 每個寶箱需要獨立的蓋子動畫，所以不走 instancing；開關狀態只讀 worldStore。
 */
export function Chest({ placement, model }: { placement: Placement; model: string }) {
  const gltf = useGLTF(assetUrl(model));
  const { root, lid, materials } = useMemo(() => {
    const root = gltf.scene.clone(true);
    const materials: THREE.Material[] = [];
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (mat) {
        obj.material = toToonMaterial(mat);
        materials.push(obj.material);
      }
      obj.castShadow = true;
      obj.receiveShadow = true;
    });
    const lid = root.getObjectByName(LID_NODE);
    if (!lid) throw new Error(`寶箱模型缺少節點 ${LID_NODE}：${model}`);
    return { root, lid, materials };
  }, [gltf.scene, model]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  const open = useWorldStore((s) => s.objects.get(placement.id)?.open === true);
  const openedFor = useRef(0);

  useFrame((_, dt) => {
    if (!open) {
      openedFor.current = 0;
      lid.rotation.x = 0;
      return;
    }
    openedFor.current += dt;
    if (openedFor.current < OPEN_DELAY) return;
    lid.rotation.x = THREE.MathUtils.damp(lid.rotation.x, OPEN_ANGLE, 7, Math.min(dt, 1 / 20));
  });

  return (
    <primitive
      object={root}
      position={placement.position}
      rotation={placement.rotation ?? [0, 0, 0]}
      scale={placement.scale ?? [1, 1, 1]}
    />
  );
}
