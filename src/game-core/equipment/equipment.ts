// 裝備系統（第二章 Phase 2，規格 §7.3、§7.4；計畫見 PHASE0_INVENTORY §4）。
// 裝備的數值與效果全部由資料（items.json）決定，這裡只做合併與套用，場景不硬編碼。
// 裝備格：weapon（武器變體）、armor（防具）、charm（飾品）。裝備中的道具不在背包裡（與背包的數量脫鉤，
// 所以不能被賣掉、交給任務或製作）。passive 效果不必裝備，持有在背包裡就生效（例如水行護符）。
import { z } from 'zod';
import { weaponIds, type WeaponId } from '../combat/weapons';

export const equipSlots = ['weapon', 'armor', 'charm'] as const;
export type EquipSlot = (typeof equipSlots)[number];

export const equipEffectKinds = ['damageTakenScale', 'attackScale', 'mistDamageScale', 'rareDropBonus', 'waterBreath', 'revealVeil'] as const;
export type EquipEffectKind = (typeof equipEffectKinds)[number];

export const equipEffectSchema = z.object({ kind: z.enum(equipEffectKinds), value: z.number().optional() });
export type EquipEffect = z.infer<typeof equipEffectSchema>;

const rgb = z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]);
const glowSchema = z.object({ color: rgb, intensity: z.number().min(0).max(4) });

/**
 * 角色模型的部位：四個 KayKit 角色模型的節點名稱是「角色前綴_部位」（Rogue_Cape、Knight_Cape…），
 * 這裡只寫部位，套用時比對節點名稱的結尾，所以同一份資料四個職業都能用。
 */
export const lookParts = ['Cape', 'ArmLeft', 'ArmRight', 'Body', 'LegLeft', 'LegRight'] as const;
export type LookPart = (typeof lookParts)[number];

/**
 * 裝備外觀（第三章規格 §7.4）：只描述顏色與發光，畫面端讀資料套用，場景不寫死。
 * 武器變體：tint / glow 套在手上的武器，trail 換揮砍拖尾的顏色（HDR）；只在目前的武器就是基礎武器時顯示。
 * 防具、飾品：tint / glow 套在 parts 列出的身體部位。
 */
export const equipLookSchema = z
  .object({
    /** 乘在原本顏色上的倍率（1 = 不變） */
    tint: rgb.optional(),
    glow: glowSchema.optional(),
    trail: rgb.optional(),
    parts: z.array(z.enum(lookParts)).min(1).optional(),
  })
  .refine((l) => l.tint || l.glow || l.trail, { message: '外觀至少要有 tint、glow 或 trail 其中一項' });
export type EquipLook = z.infer<typeof equipLookSchema>;

export const equipSpecSchema = z
  .object({
    slot: z.enum(equipSlots),
    /** 武器變體的基礎武器類型（職業能用這個類型才能裝備；攻擊時只有目前的武器是這個類型才生效） */
    base: z.enum(weaponIds).optional(),
    effects: z.array(equipEffectSchema).min(1),
    look: equipLookSchema.optional(),
  })
  .refine((e) => !e.look || (e.slot === 'weapon' ? !e.look.parts : !e.look.trail && !!e.look.parts), {
    message: '武器變體的外觀不寫 parts（套在手上的武器）；防具、飾品的外觀要寫 parts、不能有 trail',
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
  /** 照出幻影（螢光提燈：靠近的幻霧螢靈現形，第二章 M-04） */
  revealVeil: boolean;
};

export const NO_MODIFIERS: Modifiers = { damageTakenScale: 1, attackScale: 1, mistDamageScale: 1, rareDropBonus: 0, waterBreath: false, revealVeil: false };

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
        case 'revealVeil': m.revealVeil = true; break;
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

/** 目前裝備要呈現的外觀（畫面端套用） */
export type ResolvedLook = {
  /** 手上的武器（只有武器變體的基礎武器是目前的武器時才有） */
  weapon: { base: WeaponId; tint?: [number, number, number]; glow?: { color: [number, number, number]; intensity: number }; trail?: [number, number, number] } | null;
  /** 身體部位；同一個部位被兩件裝備指定時，後面的格（飾品）蓋過前面的（防具） */
  parts: Partial<Record<LookPart, { tint?: [number, number, number]; glow?: { color: [number, number, number]; intensity: number } }>>;
};

export const NO_LOOK: ResolvedLook = { weapon: null, parts: {} };

/** 依裝備格算出外觀。武器變體的外觀和攻擊加成的生效條件相同（基礎武器 = 目前的武器）。 */
export function equipmentLook(equipment: Equipment, lookup: EquipItemLookup, weapon: WeaponId): ResolvedLook {
  const look: ResolvedLook = { weapon: null, parts: {} };
  for (const slot of equipSlots) {
    const itemId = equipment[slot];
    const spec = itemId ? lookup(itemId)?.equip : undefined;
    const l = spec?.look;
    if (!spec || !l) continue;
    if (spec.slot === 'weapon') {
      if (spec.base === weapon) look.weapon = { base: weapon, tint: l.tint, glow: l.glow, trail: l.trail };
      continue;
    }
    for (const part of l.parts ?? []) look.parts[part] = { tint: l.tint, glow: l.glow };
  }
  return look;
}
