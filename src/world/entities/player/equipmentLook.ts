import * as THREE from 'three';
import { lookParts, type LookPart, type ResolvedLook } from '@/game-core/equipment/equipment';
import type { LookInfo } from '@/game/player/lookDebug';
import type { HeldId } from './CharacterModel';

type Original = { color: THREE.Color; emissive: THREE.Color; intensity: number };

/** 物件底下所有網格的 toon 材質（prepareModel / attachFrom 已經替每個網格建立自己的材質，可以直接改顏色） */
function toonMaterials(objects: readonly THREE.Object3D[]): THREE.MeshToonMaterial[] {
  const out: THREE.MeshToonMaterial[] = [];
  for (const root of objects) {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof THREE.MeshToonMaterial) out.push(m);
    });
  }
  return out;
}

/** 每個身體部位對應的節點：四個角色模型的節點都叫「角色前綴_部位」（Knight_Cape、Mage_ArmLeft…） */
function partNodes(root: THREE.Object3D): Record<LookPart, THREE.Object3D[]> {
  const out = Object.fromEntries(lookParts.map((p) => [p, [] as THREE.Object3D[]])) as Record<LookPart, THREE.Object3D[]>;
  root.traverse((o) => {
    const part = lookParts.find((p) => o.name.endsWith(`_${p}`));
    if (part) out[part].push(o);
  });
  return out;
}

export type LookApplier = {
  apply(look: ResolvedLook): void;
  /** 驗證用：目前手上武器與各部位第一個材質的發光顏色（沒有套用時是 null） */
  inspect(): LookInfo;
};

/**
 * 裝備外觀（第三章規格 §7.4）：把 equipmentLook 算出的顏色套到角色模型上。
 * 每次套用前先把上一次改過的材質還原成原本的顏色，所以換裝、卸下、換武器都只要再呼叫一次 apply。
 */
export function createLookApplier(root: THREE.Object3D, weaponNodes: Record<HeldId, THREE.Object3D[]>): LookApplier {
  const parts = partNodes(root);
  const originals = new Map<THREE.MeshToonMaterial, Original>();
  const touched = new Set<THREE.MeshToonMaterial>();
  let current: ResolvedLook | null = null;

  const paint = (materials: THREE.MeshToonMaterial[], tint?: readonly number[], glow?: { color: readonly number[]; intensity: number }) => {
    for (const m of materials) {
      if (!originals.has(m)) originals.set(m, { color: m.color.clone(), emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
      const o = originals.get(m)!;
      if (tint) m.color.setRGB(o.color.r * tint[0]!, o.color.g * tint[1]!, o.color.b * tint[2]!);
      if (glow) {
        m.emissive.setRGB(glow.color[0]!, glow.color[1]!, glow.color[2]!);
        m.emissiveIntensity = glow.intensity;
      }
      touched.add(m);
    }
  };

  return {
    apply(look) {
      for (const m of touched) {
        const o = originals.get(m)!;
        m.color.copy(o.color);
        m.emissive.copy(o.emissive);
        m.emissiveIntensity = o.intensity;
      }
      touched.clear();
      if (look.weapon) paint(toonMaterials(weaponNodes[look.weapon.base]), look.weapon.tint, look.weapon.glow);
      for (const [part, l] of Object.entries(look.parts) as [LookPart, NonNullable<ResolvedLook['parts'][LookPart]>][]) {
        paint(toonMaterials(parts[part]), l.tint, l.glow);
      }
      current = look;
    },
    inspect() {
      const emissive = (objects: readonly THREE.Object3D[]) => {
        const m = toonMaterials(objects)[0];
        return m && touched.has(m) ? [m.emissive.r, m.emissive.g, m.emissive.b] : null;
      };
      const weapon = current?.weapon?.base ?? null;
      const partInfo: Partial<Record<LookPart, number[]>> = {};
      for (const p of lookParts) {
        const e = emissive(parts[p]);
        if (e) partInfo[p] = e;
      }
      return { weapon, weaponEmissive: weapon ? emissive(weaponNodes[weapon]) : null, parts: partInfo };
    },
  };
}
