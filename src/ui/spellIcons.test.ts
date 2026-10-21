import { describe, expect, it } from 'vitest';
import spells from '@/data/spells.json';
import classes from '@/data/classes.json';
import { heroClassIds } from '@/game-core/character/heroClass';
import { weaponIds } from '@/game-core/combat/weapons';
import { ACTION_ICON_IDS } from './ActionIcon';
import { SKILL_ICON_IDS } from './SkillIcon';
import { CLASS_TONES, SPELL_ICONS } from './spellIcons';

describe('技能與按鈕圖示的對應', () => {
  it('每個法術都對應到存在的技能圖示', () => {
    for (const spell of spells) {
      expect(SPELL_ICONS[spell.id], spell.id).toBeDefined();
      expect(SKILL_ICON_IDS).toContain(SPELL_ICONS[spell.id]);
    }
  });

  it('同一個職業的三個法術圖樣不重複', () => {
    for (const c of classes) {
      const icons = c.spells.map((id) => SPELL_ICONS[id]);
      expect(new Set(icons).size, c.id).toBe(icons.length);
    }
  });

  it('每個職業都有外框色，每把武器都有按鈕圖示', () => {
    for (const id of heroClassIds) expect(CLASS_TONES[id]).toBeDefined();
    for (const id of weaponIds) expect(ACTION_ICON_IDS).toContain(id);
  });
});
