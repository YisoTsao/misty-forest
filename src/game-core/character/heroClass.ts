// 職業（使用者 2026-10-17：初始角色從一名增加到四種職業）：外型（characters.json 的角色）、能用的武器、三個法術。
// 資料在 data/classes.json；純函式，伺服器（檢查名牌上的職業）與客戶端共用。
import { z } from 'zod';
import type { SpellCatalog, SpellDef } from '../combat/spells';
import { weaponIds, type WeaponCatalog, type WeaponId } from '../combat/weapons';

export const heroClassIds = ['traveler', 'knight', 'mage', 'barbarian'] as const;
export type HeroClassId = (typeof heroClassIds)[number];
/** 舊存檔與沒有選職業時：原本唯一的角色 */
export const DEFAULT_HERO_CLASS: HeroClassId = 'traveler';

const heroClassSchema = z.object({
  id: z.enum(heroClassIds),
  /** 職業的名字（星光旅人）、稱號（遊俠）與介紹 */
  nameKey: z.string().min(1),
  roleKey: z.string().min(1),
  descKey: z.string().min(1),
  icon: z.string().min(1),
  /** characters.json 的角色 id（模型與動畫） */
  character: z.string().min(1),
  /** 依序對應「武器 1–3」的按鍵 */
  weapons: z.array(z.enum(weaponIds)).min(1).max(3),
  defaultWeapon: z.enum(weaponIds),
  /** 法術 id；每個法術的 action（skill / spell2 / spell3）在同一個職業內不可重複 */
  spells: z.array(z.string().min(1)).min(1).max(3),
});
export type HeroClassDef = z.infer<typeof heroClassSchema>;
export type HeroClassCatalog = ReadonlyMap<HeroClassId, HeroClassDef>;

export function isHeroClassId(value: unknown): value is HeroClassId {
  return typeof value === 'string' && (heroClassIds as readonly string[]).includes(value);
}

/** 驗證職業資料：武器與法術都要存在、預設武器在可用武器內、同一職業的法術不共用按鍵；四個職業都要有 */
export function parseHeroClasses(raw: unknown, ctx: { weapons: WeaponCatalog; spells: SpellCatalog; characters: ReadonlySet<string> }): HeroClassCatalog {
  const list = z.array(heroClassSchema).parse(raw);
  const map = new Map<HeroClassId, HeroClassDef>();
  for (const c of list) {
    if (map.has(c.id)) throw new Error(`職業 id 重複：${c.id}`);
    if (!ctx.characters.has(c.character)) throw new Error(`職業 ${c.id} 的角色不存在：${c.character}`);
    if (new Set(c.weapons).size !== c.weapons.length) throw new Error(`職業 ${c.id} 的武器重複`);
    for (const w of c.weapons) if (!ctx.weapons.weapons.has(w)) throw new Error(`職業 ${c.id} 的武器不存在：${w}`);
    if (!c.weapons.includes(c.defaultWeapon)) throw new Error(`職業 ${c.id} 的預設武器不在可用武器內`);
    const actions = new Set<string>();
    for (const id of c.spells) {
      const spell = ctx.spells.get(id);
      if (!spell) throw new Error(`職業 ${c.id} 的法術不存在：${id}`);
      if (actions.has(spell.action)) throw new Error(`職業 ${c.id} 有兩個法術使用同一個按鍵動作：${spell.action}`);
      actions.add(spell.action);
    }
    map.set(c.id, c);
  }
  for (const id of heroClassIds) if (!map.has(id)) throw new Error(`缺少職業：${id}`);
  return map;
}

/** 這個職業的法術（依資料順序） */
export function classSpells(def: HeroClassDef, spells: SpellCatalog): SpellDef[] {
  return def.spells.map((id) => spells.get(id)).filter((s): s is SpellDef => s !== undefined);
}

export function canUseWeapon(def: HeroClassDef, weapon: WeaponId): boolean {
  return def.weapons.includes(weapon);
}

export function canCastSpell(def: HeroClassDef, spellId: string): boolean {
  return def.spells.includes(spellId);
}
