// 法術與職業對應到角色技能圖示（SkillIcon，任務 11M-3 的設計稿）。
// 設計稿的技能名稱與 spells.json 的法術不同，這裡依效果挑最接近的圖樣，外框顏色依法術所屬的職業。
import type { HeroClassId } from '@/game-core/character/heroClass';
import type { SkillIconId, SkillTone } from './SkillIcon';

/** spells.json 的 12 個法術 → 圖樣 */
export const SPELL_ICONS: Record<string, SkillIconId> = {
  // 星光旅人
  spell_starlight_burst: 'starlight_burst',
  spell_star_bolt: 'magic_missile',
  spell_meteor_shower: 'meteor',
  // 騎士
  spell_holy_shockwave: 'holy_domain',
  spell_light_lance: 'holy_slash',
  spell_judgement: 'lightning',
  // 法師
  spell_frost_nova: 'frost_spell',
  spell_arcane_missiles: 'magic_missile',
  spell_fire_storm: 'fire_spell',
  // 野蠻人
  spell_war_cry: 'war_cry',
  spell_throwing_axes: 'whirlwind',
  spell_earthquake: 'earth_crash',
};

/** 職業 → 外框色（野蠻人用設計稿的戰士紅） */
export const CLASS_TONES: Record<HeroClassId, SkillTone> = {
  traveler: 'traveler',
  knight: 'knight',
  mage: 'mage',
  barbarian: 'warrior',
};

/** 法術的圖樣；沒有對應的新法術用星光爆發 */
export function spellIconOf(spellId: string): SkillIconId {
  return SPELL_ICONS[spellId] ?? 'starlight_burst';
}
