// 裝備系統（第二章 Phase 2，規格 §7.3、§7.4；計畫見 PHASE0_INVENTORY §4）。
// 裝備的數值與效果全部由資料（items.json）決定，這裡只做合併與套用，場景不硬編碼。
// 裝備格：weapon（武器變體）、armor（防具）、charm（飾品）。裝備中的道具不在背包裡（與背包的數量脫鉤，
// 所以不能被賣掉、交給任務或製作）。passive 效果不必裝備，持有在背包裡就生效（例如水行護符）。
import { z } from 'zod';
import { weaponIds, type WeaponId } from '../combat/weapons';

export const equipSlots = ['weapon', 'armor', 'charm'] as const;
export type EquipSlot = (typeof equipSlots)[number];

export const equipEffectKinds = ['damageTakenScale', 'attackScale', 'mistDamageScale', 'rareDropBonus', 'waterBreath'] as const;
export type EquipEffectKind = (typeof equipEffectKinds)[number];

export const equipEffectSchema = z.object({ kind: z.enum(equipEffectKinds), value: z.number().optional() });
export type EquipEffect = z.infer<typeof equipEffectSchema>;

export const equipSpecSchema = z.object({
  slot: z.enum(equipSlots),
  /** 武器變體的基礎武器類型（職業能用這個類型才能裝備；攻擊時只有目前的武器是這個類型才生效） */
  base: z.enum(weaponIds).optional(),
  effects: z.array(equipEffectSchema).min(1),
});
export type EquipSpec = z.infer<typeof equipSpecSchema>;

/** 裝備格 → 道具 id */
export type Equipment = Partial<Record<EquipSlot, string>>;

/** 合併後的倍率（沒有裝備時是預設值） */
export type Modifiers = {
  /** 受到的傷害倍率（守林者護腕 0.9） */
  damageTakenScale: number;
  /** 普通攻擊的傷害倍率（只在武器變體的基礎武器是目前的武器時生效） */
  attackScale: number;
  /** 迷霧區域的持續傷害倍率（Phase 3 迷霧深層才有作用） */
  mistDamageScale: number;
  /** 稀有掉落（掉落表 rare 項目）的機率加成 */
  rareDropBonus: number;
  /** 涉水（水行護符：可以走進較深的水） */
  waterBreath: boolean;
};

export const NO_MODIFIERS: Modifiers = { damageTakenScale: 1, attackScale: 1, mistDamageScale: 1, rareDropBonus: 0, waterBreath: false };

/** 需要的最少資料：道具 id 對應到的裝備規格與被動效果 */
export type EquipItemDef = { equip?: EquipSpec; passive?: EquipEffect[] };
export type EquipItemLookup = (itemId: string) => EquipItemDef | undefined;

/**
 * 合併裝備格與背包的被動效果成一份倍率。
 * 倍率相乘（兩件防具同類效果時疊加倍率）；bonus 相加；布林效果只要有一個就成立。
 * held：背包裡持有的道具 id（被動效果只看這裡，不管有沒有裝備）。
 */
export function equipmentModifiers(equipment: Equipment, held: Iterable<string>, lookup: EquipItemLookup, weapon: WeaponId): Modifiers {
  const m: Modifiers = { ...NO_MODIFIERS };
  const apply = (effects: readonly EquipEffect[] | undefined, weaponMatch: boolean) => {
    for (const e of effects ?? []) {
      const v = e.value ?? 0;
      switch (e.kind) {
        case 'damageTakenScale': m.damageTakenScale *= v; break;
        case 'mistDamageScale': m.mistDamageScale *= v; break;
        case 'rareDropBonus': m.rareDropBonus += v; break;
        case 'waterBreath': m.waterBreath = true; break;
        case 'attackScale': if (weaponMatch) m.attackScale *= v; break;
      }
    }
  };
  for (const slot of equipSlots) {
    const itemId = equipment[slot];
    if (!itemId) continue;
    const def = lookup(itemId);
    if (!def?.equip) continue;
    const base = def.equip.base;
    apply(def.equip.effects, base === undefined || base === weapon);
  }
  for (const itemId of held) apply(lookup(itemId)?.passive, true);
  return m;
}

/** 傷害套用倍率：至少留 1 點傷害（有傷害就不會變成 0） */
export function scaleDamage(amount: number, scale: number): number {
  if (amount <= 0) return amount;
  return Math.max(1, Math.round(amount * scale));
}
