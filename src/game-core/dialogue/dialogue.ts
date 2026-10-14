// 節點式對話（規格 6.4）：id、說話者、文字 key、選項、條件、效果。
// 對話本身是本機 UI 流程；選項的「效果」（接任務、回報）是送給權威層的指令，由呼叫端送出。
// 這裡只負責「目前顯示哪個節點、有哪些選項、選了之後去哪裡、要送出哪些效果」。

export const dialogueEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('acceptQuest'), quest: z.string().min(1) }),
  z.object({ type: z.literal('turnInQuest'), quest: z.string().min(1) }),
  /** 完成這個任務裡「和目前對話的 NPC 談」的目標（任務 7G 送信） */
  z.object({ type: z.literal('questTalk'), quest: z.string().min(1) }),
  /** 在酒館休息：體力回滿 */
  z.object({ type: z.literal('rest') }),
  /** 在酒館睡到指定時刻：體力回滿、時間前進（GAME_DESIGN 5.2） */
  z.object({ type: z.literal('sleep'), untilHour: z.number().min(0).lt(24) }),
]);
export type DialogueEffect = z.infer<typeof dialogueEffectSchema>;
import { z } from 'zod';
import type { GameState } from '../authority/rules';
import { conditionSchema, evaluateCondition, type Condition, type ConditionContext } from './conditions';

const optionSchema = z.object({
  textKey: z.string().min(1),
  /** 下一個節點；省略表示結束對話 */
  next: z.string().min(1).optional(),
  /** 不符合條件的選項不顯示 */
  when: conditionSchema.optional(),
  /** 選擇後送出的效果 */
  effects: z.array(dialogueEffectSchema).optional(),
});

const nodeSchema = z
  .object({
    /** 說話者名稱（i18n key）；省略表示旁白 */
    speakerKey: z.string().min(1).optional(),
    textKey: z.string().min(1),
    /** 沒有選項時，繼續後前往的節點；省略表示結束 */
    next: z.string().min(1).optional(),
    options: z.array(optionSchema).min(1).optional(),
  })
  .refine((n) => !(n.next && n.options), { message: 'next 與 options 只能擇一' });

export const dialogueDefSchema = z.object({
  id: z.string().min(1),
  start: z.string().min(1),
  nodes: z.record(z.string(), nodeSchema),
});
export type DialogueDef = z.infer<typeof dialogueDefSchema>;
export type DialogueNode = z.infer<typeof nodeSchema>;

export class DialogueDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DialogueDataError';
  }
}

/** 驗證格式與節點參照（start / next 都必須指向存在的節點） */
export function parseDialogues(raw: unknown): Map<string, DialogueDef> {
  const parsed = z.array(dialogueDefSchema).safeParse(raw);
  if (!parsed.success) throw new DialogueDataError(`dialogues 資料格式錯誤：${z.prettifyError(parsed.error)}`);
  const map = new Map<string, DialogueDef>();
  for (const d of parsed.data) {
    if (map.has(d.id)) throw new DialogueDataError(`對話 id 重複：${d.id}`);
    const refs = [d.start, ...Object.values(d.nodes).flatMap((n) => [n.next, ...(n.options ?? []).map((o) => o.next)])];
    for (const ref of refs) {
      if (ref !== undefined && !d.nodes[ref]) throw new DialogueDataError(`對話 ${d.id} 參照不存在的節點：${ref}`);
    }
    map.set(d.id, d);
  }
  return map;
}

export type DialogueView = {
  nodeId: string;
  speakerKey?: string;
  textKey: string;
  /** 目前可選的選項（已依條件過濾）；null 表示沒有選項，按繼續 */
  options: { index: number; textKey: string }[] | null;
};

export function viewNode(def: DialogueDef, nodeId: string, state: GameState, ctx: ConditionContext): DialogueView {
  const node = def.nodes[nodeId];
  if (!node) throw new DialogueDataError(`對話 ${def.id} 沒有節點 ${nodeId}`);
  const options = node.options
    ? node.options.flatMap((o, index) => (evaluateCondition(o.when, state, ctx) ? [{ index, textKey: o.textKey }] : []))
    : null;
  return { nodeId, speakerKey: node.speakerKey, textKey: node.textKey, options };
}

export type DialogueStep = { next: string | null; effects: DialogueEffect[] };

/**
 * 從目前節點前進：有選項時必須給 optionIndex（且該選項符合條件），否則前往 next。
 * 回傳下一個節點（null = 結束）與選項的效果。
 */
export function advanceDialogue(def: DialogueDef, nodeId: string, state: GameState, ctx: ConditionContext, optionIndex?: number): DialogueStep {
  const node = def.nodes[nodeId];
  if (!node) throw new DialogueDataError(`對話 ${def.id} 沒有節點 ${nodeId}`);
  if (!node.options) return { next: node.next ?? null, effects: [] };
  const option = optionIndex === undefined ? undefined : node.options[optionIndex];
  if (!option || !evaluateCondition(option.when, state, ctx)) throw new DialogueDataError(`節點 ${nodeId} 沒有可選的選項 ${optionIndex}`);
  return { next: option.next ?? null, effects: option.effects ?? [] };
}

/** NPC 依目前狀態選擇要說的對話：第一個符合條件者 */
export function pickDialogue(talk: readonly { when?: Condition; dialogue: string }[], state: GameState, ctx: ConditionContext): string | null {
  return talk.find((t) => evaluateCondition(t.when, state, ctx))?.dialogue ?? null;
}
