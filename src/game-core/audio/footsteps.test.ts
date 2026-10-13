import { describe, expect, it } from 'vitest';
import { BRIDGE } from '../world/terrain';
import { footstepInterval, surfaceAt } from './footsteps';

describe('footsteps', () => {
  it('靜止不出聲；跑步的步伐比走路密', () => {
    expect(footstepInterval(0.2)).toBeNull();
    const walk = footstepInterval(3)!;
    const run = footstepInterval(6.2)!;
    expect(run).toBeLessThan(walk);
    expect(walk).toBeCloseTo(0.5);
  });

  it('木橋上是木頭聲，橋下或其他地方是草地', () => {
    expect(surfaceAt(BRIDGE.x, BRIDGE.z, BRIDGE.deckY)).toBe('wood');
    expect(surfaceAt(BRIDGE.x, BRIDGE.z, -3)).toBe('grass');
    expect(surfaceAt(0, 18, 0)).toBe('grass');
  });
});
