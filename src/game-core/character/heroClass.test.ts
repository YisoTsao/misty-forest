import { describe, expect, it } from 'vitest';
import characters from '@/data/characters.json';
import classesData from '@/data/classes.json';
import spellsData from '@/data/spells.json';
import weaponsData from '@/data/weapons.json';
import { parseCharacterDefs } from './characterDef';
import { classSpells, heroClassIds, parseHeroClasses } from './heroClass';
import { parseSpells } from '../combat/spells';
import { parseWeapons } from '../combat/weapons';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState } from '../authority/rules';
import { testContext } from '../testing/fixtures';

const ctx = { weapons: parseWeapons(weaponsData), spells: parseSpells(spellsData), characters: new Set(parseCharacterDefs(characters).keys()) };
const classes = parseHeroClasses(classesData, ctx);

describe('職業（使用者 2026-10-17）', () => {
  it('四個職業，各自不同的角色模型', () => {
    expect([...classes.keys()]).toEqual([...heroClassIds]);
    const models = [...classes.values()].map((c) => parseCharacterDefs(characters).get(c.character)!.model);
    expect(new Set(models).size).toBe(4);
  });

  it('每個職業有 Q / F / C 三個法術，四個職業的法術都不一樣', () => {
    const all: string[] = [];
    for (const c of classes.values()) {
      const spells = classSpells(c, ctx.spells);
      expect(spells.map((s) => s.action).sort()).toEqual(['skill', 'spell2', 'spell3']);
      all.push(...spells.map((s) => s.id));
    }
    expect(new Set(all).size).toBe(12);
  });

  it('每個職業的招式組合不同：除了徒手以外的武器互不重複', () => {
    const signature = [...classes.values()].map((c) => c.weapons.filter((w) => w !== 'fist').join(','));
    expect(new Set(signature).size).toBe(4);
    for (const c of classes.values()) expect(c.weapons).toContain(c.defaultWeapon);
  });

  it('旅人保留原本的武器與星光法術（舊存檔讀進來不變）', () => {
    const traveler = classes.get('traveler')!;
    expect(traveler.weapons).toEqual(['fist', 'knife', 'sword']);
    expect(traveler.spells).toEqual(['spell_starlight_burst', 'spell_star_bolt', 'spell_meteor_shower']);
  });

  it('拒絕：同一職業兩個法術共用按鍵、預設武器不在可用武器內、不存在的法術、缺少職業', () => {
    const base = structuredClone(classesData);
    const dup = structuredClone(base);
    dup[0]!.spells = ['spell_starlight_burst', 'spell_frost_nova'];
    expect(() => parseHeroClasses(dup, ctx)).toThrow(/同一個按鍵動作/);
    const badDefault = structuredClone(base);
    badDefault[2]!.defaultWeapon = 'sword';
    expect(() => parseHeroClasses(badDefault, ctx)).toThrow(/預設武器/);
    const missingSpell = structuredClone(base);
    missingSpell[1]!.spells = ['spell_nope'];
    expect(() => parseHeroClasses(missingSpell, ctx)).toThrow(/法術不存在/);
    expect(() => parseHeroClasses(base.slice(0, 3), ctx)).toThrow(/缺少職業/);
  });
});

describe('職業的規則', () => {
  const rules = { ...testContext(), heroClasses: classes };
  const run = (state: GameState, cmd: GameCommand) => applyEvents(state, handleCommand(state, cmd, rules), rules);
  const rejected = (state: GameState, cmd: GameCommand) => handleCommand(state, cmd, rules).find((e) => e.type === 'CommandRejected');

  it('新遊戲選法師：換成法杖；不能換旅人的短刀，也不能施放旅人的法術', () => {
    const mage = run(initialGameState(), { type: 'ChooseClass', heroClass: 'mage' });
    expect(mage.player).toMatchObject({ heroClass: 'mage', weapon: 'staff' });
    expect(rejected(mage, { type: 'EquipWeapon', weapon: 'knife' })).toBeDefined();
    expect(rejected(mage, { type: 'CastSpell', spell: 'spell_starlight_burst' })).toBeDefined();
    const cast = run(mage, { type: 'CastSpell', spell: 'spell_frost_nova' });
    expect(cast.player.mp).toBeLessThan(mage.player.mp);
  });

  it('不認得的職業被拒絕；沒有職業資料時不檢查（舊的規則測試）', () => {
    expect(rejected(initialGameState(), { type: 'ChooseClass', heroClass: 'pirate' as never })).toBeDefined();
    const plain = testContext();
    expect(handleCommand(initialGameState(), { type: 'CastSpell', spell: 'spell_frost_nova' }, plain).some((e) => e.type === 'SpellCast')).toBe(true);
  });
});
