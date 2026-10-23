// 每個任務都要有接取的途徑：某段對話的 acceptQuest、某個物件啟動時的 startsQuest，或寶箱打開時的 startsQuest（序章）。
// 第二章曾有兩個主線任務（quest_forest_003、008）只有提示、沒有接取，正常遊玩會卡關（任務 13N、13R）。
import { describe, expect, it } from 'vitest';
import dialoguesData from '@/data/dialogues.json';
import prefabsData from '@/data/prefabs.json';
import questsData from '@/data/quests.json';

type Effect = { type: string; quest?: string };
type DialogueNode = { options?: { effects?: Effect[] }[] };

const accepted = new Set<string>();
for (const d of dialoguesData as unknown as { nodes: Record<string, DialogueNode> }[]) {
  for (const node of Object.values(d.nodes)) for (const o of node.options ?? []) for (const e of o.effects ?? []) if (e.type === 'acceptQuest' && e.quest) accepted.add(e.quest);
}
for (const p of prefabsData as unknown as { activate?: { startsQuest?: string }; contents?: { startsQuest?: string } }[]) {
  for (const id of [p.activate?.startsQuest, p.contents?.startsQuest]) if (id) accepted.add(id);
}

describe('任務的接取途徑', () => {
  it('每個任務都能在對話或物件上接取', () => {
    const missing = (questsData as { id: string }[]).map((q) => q.id).filter((id) => !accepted.has(id));
    expect(missing).toEqual([]);
  });
});
