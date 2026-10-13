// 動畫來源驗證（Phase 0 閘門，規格 4.6）的自動化部分：
// 確認角色 GLB 內含所有需要的動畫片段，且全部作用在同一套骨架上。
// 「不變形」的視覺確認由 `node scripts/screenshot.mjs <階段> --anim` 截圖完成。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import characters from '@/data/characters.json';
import { parseCharacterDefs, requiredClipKeys } from '@/game-core/character/characterDef';
import weaponsData from '@/data/weapons.json';
import { moveClips, parseWeapons } from '@/game-core/combat/weapons';
import spellsData from '@/data/spells.json';
import { parseSpells } from '@/game-core/combat/spells';

type GltfJson = {
  animations?: { name: string; channels: { target: { node?: number } }[] }[];
  skins?: { joints: number[] }[];
  nodes: { name?: string; children?: number[] }[];
};

function readGlbJson(file: string): GltfJson {
  const buf = readFileSync(file);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson;
}

const defs = parseCharacterDefs(characters);

describe.each([...defs.values()])('角色 $id', (def) => {
  const gltf = readGlbJson(path.join('public', def.model));

  it('只有一套骨架', () => {
    expect(gltf.skins).toHaveLength(1);
  });

  it.each(requiredClipKeys)('包含 %s 動畫，且只驅動骨架節點', (key) => {
    const clipName = def.clips[key];
    const clip = gltf.animations?.find((a) => a.name === clipName);
    expect(clip, `找不到動畫片段 ${clipName}`).toBeDefined();
    const joints = new Set(gltf.skins?.[0]?.joints);
    const targets = clip?.channels.map((c) => c.target.node).filter((n): n is number => n !== undefined) ?? [];
    expect(targets.length).toBeGreaterThan(0);
    // 動畫若驅動骨架以外的節點，代表片段不是為此骨架製作
    const foreign = targets.filter((n) => !joints.has(n)).map((n) => gltf.nodes[n]?.name);
    expect(foreign.filter((name) => name && !/IK|control|root/i.test(name))).toEqual([]);
  });

  it('要隱藏的節點都存在', () => {
    const names = new Set(gltf.nodes.map((n) => n.name));
    for (const node of def.hiddenNodes) expect(names.has(node), node).toBe(true);
  });
});

// 近戰招式（GAME_DESIGN 5.3）：玩家角色的 GLB 必須包含每一招的動畫；武器模型掛在右手的 handslot 上
describe('近戰招式與武器模型', () => {
  const player = defs.get('traveler')!;
  const gltf = readGlbJson(path.join('public', player.model));
  const names = new Set(gltf.animations?.map((a) => a.name));
  const catalog = parseWeapons(weaponsData);

  it.each(moveClips(catalog))('玩家 GLB 包含招式動畫 %s', (clip) => {
    expect(names.has(clip)).toBe(true);
  });

  it.each([
    ['models/characters/kaykit-adventurers/Rogue_Hooded.glb', 'Knife'],
    ['models/characters/kaykit-adventurers/Rogue_Hooded.glb', 'Knife_Offhand'],
    ['models/characters/kaykit-adventurers/Knight.glb', '1H_Sword'],
    ['models/characters/kaykit-adventurers/Mage.glb', '1H_Wand'],
  ])('%s 有武器節點 %s，掛在 handslot 骨頭下', (file, node) => {
    const json = readGlbJson(path.join('public', file));
    const index = json.nodes.findIndex((n) => n.name === node);
    expect(index).toBeGreaterThanOrEqual(0);
    const parent = json.nodes.find((n) => n.children?.includes(index));
    expect(parent?.name).toMatch(/^handslot\.[lr]$/);
  });
});

// 魔法（GAME_DESIGN 5.4）：施法的蓄力與發動動畫都在玩家 GLB 內
describe('法術動畫', () => {
  const player = defs.get('traveler')!;
  const names = new Set(readGlbJson(path.join('public', player.model)).animations?.map((a) => a.name));
  it.each([...parseSpells(spellsData).values()].flatMap((s) => [s.clips.cast, s.clips.release]))('玩家 GLB 包含 %s', (clip) => {
    expect(names.has(clip)).toBe(true);
  });
});
