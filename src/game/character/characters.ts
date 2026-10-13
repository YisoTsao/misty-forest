import characters from '@/data/characters.json';
import { parseCharacterDefs, type CharacterDef } from '@/game-core/character/characterDef';

const defs = parseCharacterDefs(characters);

export function getCharacterDef(id: string): CharacterDef {
  const def = defs.get(id);
  if (!def) throw new Error(`未定義的角色：${id}`);
  return def;
}

export const PLAYER_CHARACTER_ID = 'traveler';
