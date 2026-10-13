import { describe, expect, it } from 'vitest';
import { isTutorialStepComplete, nextTutorialStep, TUTORIAL_MOVE_DISTANCE } from './tutorial';

const none = { movedDistance: 0, anyChestOpen: false, anyHarvested: false, inventoryOpened: false };

describe('tutorial', () => {
  it('每一步的完成條件', () => {
    expect(isTutorialStepComplete('move', none)).toBe(false);
    expect(isTutorialStepComplete('move', { ...none, movedDistance: TUTORIAL_MOVE_DISTANCE })).toBe(true);
    expect(isTutorialStepComplete('interact', { ...none, anyChestOpen: true })).toBe(true);
    expect(isTutorialStepComplete('interact', { ...none, anyHarvested: true })).toBe(false);
    expect(isTutorialStepComplete('harvest', { ...none, anyHarvested: true })).toBe(true);
    expect(isTutorialStepComplete('inventory', { ...none, inventoryOpened: true })).toBe(true);
    expect(isTutorialStepComplete('done', { movedDistance: 99, anyChestOpen: true, anyHarvested: true, inventoryOpened: true })).toBe(false);
  });

  it('最後一步之後停在 done', () => {
    expect(nextTutorialStep('inventory')).toBe('done');
    expect(nextTutorialStep('done')).toBe('done');
  });
});
