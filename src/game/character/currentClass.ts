// 目前職業的查詢（使用者 2026-10-17）：外型、能用的武器與法術。職業本身在權威狀態（player.heroClass）。
import type { CharacterDef } from '@/game-core/character/characterDef';
import { classSpells, DEFAULT_HERO_CLASS, isHeroClassId, type HeroClassDef, type HeroClassId } from '@/game-core/character/heroClass';
import type { SpellDef } from '@/game-core/combat/spells';
import { weaponIds, type WeaponId } from '@/game-core/combat/weapons';
import { authority, heroClasses, spells } from '../authority';
import { getCharacterDef, PLAYER_CHARACTER_ID } from './characters';

export function heroClassDef(id: HeroClassId): HeroClassDef | undefined {
  return heroClasses.get(id);
}

/** 職業的角色模型；不認得的職業（舊版客戶端、資料錯誤）用原本的旅人 */
export function classCharacter(id: string): CharacterDef {
  const def = isHeroClassId(id) ? heroClasses.get(id) : undefined;
  return getCharacterDef(def?.character ?? PLAYER_CHARACTER_ID);
}

export function currentHeroClass(): HeroClassId {
  return authority.getState().player.heroClass ?? DEFAULT_HERO_CLASS;
}

/** 目前職業的法術；沒有職業資料時是全部的法術 */
export function spellsOf(id: HeroClassId): SpellDef[] {
  const def = heroClasses.get(id);
  return def ? classSpells(def, spells) : [...spells.values()];
}

export function currentSpells(): SpellDef[] {
  return spellsOf(currentHeroClass());
}

/** 目前職業的武器（依「武器 1–3」的順序）；沒有職業資料時是全部的武器 */
export function weaponsOf(id: HeroClassId): readonly WeaponId[] {
  return heroClasses.get(id)?.weapons ?? weaponIds;
}

export function currentWeapons(): readonly WeaponId[] {
  return weaponsOf(currentHeroClass());
}
