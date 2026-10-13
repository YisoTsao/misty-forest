import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { combatRuntime } from '@/game/combat/combatRuntime';

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
      <DamageNumbers />
    </>
  );
}
