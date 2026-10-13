import { describe, expect, it } from 'vitest';
import dialoguesData from '@/data/dialogues.json';
import npcsData from '@/data/npcs.json';
import { initialGameState, type GameState } from '../authority/rules';
import { addItems } from '../inventory/inventory';
import { parseNpcs, stepPatrol } from '../npc/npc';
import { testItems } from '../testing/fixtures';
import { evaluateCondition } from './conditions';
import { advanceDialogue, DialogueDataError, parseDialogues, pickDialogue, viewNode, type DialogueDef } from './dialogue';

const catalog = new Map(testItems.map((i) => [i.id, i]));
const def: DialogueDef = {
  id: 'd',
  start: 'a',
  nodes: {
    a: { speakerKey: 'npc.x', textKey: 't.a', next: 'b' },
    b: {
      textKey: 't.b',
      options: [
        { textKey: 'o.again', next: 'a' },
        { textKey: 'o.rich', next: 'c', when: { type: 'hasItems', items: [{ itemId: 'wood', count: 5 }] } },
        { textKey: 'o.bye' },
      ],
    },
    c: { textKey: 't.c' },
  },
};

describe('dialogue', () => {
  it('專案的對話與 NPC 資料合法（節點與對話參照都存在）', () => {
    const dialogues = parseDialogues(dialoguesData);
    expect(parseNpcs(npcsData, new Set(dialogues.keys())).length).toBeGreaterThanOrEqual(3);
  });

  it('拒絕參照不存在的節點', () => {
    expect(() => parseDialogues([{ ...def, nodes: { ...def.nodes, a: { textKey: 't', next: 'zzz' } } }])).toThrow(DialogueDataError);
  });

  it('沒有選項的節點前往 next；最後一個節點結束', () => {
    const s = initialGameState();
    expect(advanceDialogue(def, 'a', s)).toEqual({ next: 'b' });
    expect(advanceDialogue(def, 'c', s)).toEqual({ next: null });
  });

  it('選項依條件顯示；index 為原始索引', () => {
    const poor = initialGameState();
    expect(viewNode(def, 'b', poor).options).toEqual([
      { index: 0, textKey: 'o.again' },
      { index: 2, textKey: 'o.bye' },
    ]);
    const rich: GameState = { ...poor, inventory: addItems(poor.inventory, [{ itemId: 'wood', count: 5 }], catalog)! };
    expect(viewNode(def, 'b', rich).options?.map((o) => o.index)).toEqual([0, 1, 2]);
    expect(advanceDialogue(def, 'b', rich, 1)).toEqual({ next: 'c' });
    expect(advanceDialogue(def, 'b', poor, 2)).toEqual({ next: null });
  });

  it('不符合條件或不存在的選項不能選', () => {
    expect(() => advanceDialogue(def, 'b', initialGameState(), 1)).toThrow(DialogueDataError);
    expect(() => advanceDialogue(def, 'b', initialGameState(), 9)).toThrow(DialogueDataError);
    expect(() => advanceDialogue(def, 'b', initialGameState())).toThrow(DialogueDataError);
  });

  it('NPC 依狀態挑選第一個符合條件的對話', () => {
    const talk = [{ when: { type: 'mistStage' as const, region: 'forest' as const, is: 'clear' as const }, dialogue: 'cleared' }, { dialogue: 'intro' }];
    const s = initialGameState();
    expect(pickDialogue(talk, s)).toBe('intro');
    expect(pickDialogue(talk, { ...s, mist: { ...s.mist, forest: 'clear' } })).toBe('cleared');
  });
});

describe('conditions', () => {
  it('not / all / tutorialDone', () => {
    const s = initialGameState();
    expect(evaluateCondition({ type: 'tutorialDone' }, s)).toBe(false);
    expect(evaluateCondition({ type: 'not', condition: { type: 'tutorialDone' } }, s)).toBe(true);
    expect(evaluateCondition({ type: 'all', conditions: [{ type: 'tutorialDone' }, { type: 'mistStage', region: 'meadow', is: 'clear' }] }, { ...s, tutorial: 'done' })).toBe(true);
    expect(evaluateCondition(undefined, s)).toBe(true);
  });
});

describe('stepPatrol', () => {
  const patrol = { points: [[0, 0], [0, 10]] as [number, number][], speed: 2, pauseSec: 1 };

  it('走向目標點、到達後停留再往下一點', () => {
    const state = { target: 1, wait: 0 };
    let pos = { x: 0, z: 0 };
    const a = stepPatrol(patrol, state, pos, 1);
    expect(a).toMatchObject({ x: 0, z: 2, walking: true });
    pos = { x: 0, z: 9.5 };
    const b = stepPatrol(patrol, state, pos, 1);
    expect(b).toMatchObject({ x: 0, z: 10, walking: false });
    expect(state).toEqual({ target: 0, wait: 1 });
    expect(stepPatrol(patrol, state, { x: 0, z: 10 }, 0.5)).toMatchObject({ x: 0, z: 10, walking: false });
    expect(stepPatrol(patrol, state, { x: 0, z: 10 }, 0.6).walking).toBe(false); // 停留結束
    expect(stepPatrol(patrol, state, { x: 0, z: 10 }, 0.5)).toMatchObject({ z: 9, walking: true });
  });
});
