// 教學引導（規格 6.9：出生草原內完成移動、互動、採集）。步驟依序進行，進度屬於權威狀態並隨存檔保存。

export const tutorialSteps = ['move', 'interact', 'harvest', 'inventory', 'done'] as const;
export type TutorialStep = (typeof tutorialSteps)[number];

export function nextTutorialStep(step: TutorialStep): TutorialStep {
  const i = tutorialSteps.indexOf(step);
  return tutorialSteps[Math.min(i + 1, tutorialSteps.length - 1)]!;
}

/** 完成「移動」步驟需要離開起點的距離（公尺） */
export const TUTORIAL_MOVE_DISTANCE = 4;

/**
 * 依目前的遊戲狀況判斷這一步是否完成。
 * 移動與開背包屬於本機操作，由呼叫端提供；開箱與採集看權威狀態（先做了也算）。
 */
export function isTutorialStepComplete(
  step: TutorialStep,
  ctx: { movedDistance: number; anyChestOpen: boolean; anyHarvested: boolean; inventoryOpened: boolean },
): boolean {
  switch (step) {
    case 'move':
      return ctx.movedDistance >= TUTORIAL_MOVE_DISTANCE;
    case 'interact':
      return ctx.anyChestOpen;
    case 'harvest':
      return ctx.anyHarvested;
    case 'inventory':
      return ctx.inventoryOpened;
    case 'done':
      return false;
  }
}
