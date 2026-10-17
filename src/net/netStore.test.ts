import { describe, expect, it } from 'vitest';
import { NET, type RemoteActionMessage, type RemotePlayerView } from '@/game-core/net/protocol';
import { createRemoteEntry, takeDueActions } from './netStore';

const view: RemotePlayerView = { sessionId: 's', t: 0, playerId: 'p', name: 'A', x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', map: 'dawnvale', location: 'overworld', weapon: 'sword', heroClass: 'traveler', online: true };
const melee = (t: number, move = 'sword_chop'): RemoteActionMessage => ({ kind: 'melee', t, move, sessionId: 's' });

describe('遠端玩家的動作佇列（任務 11E）', () => {
  it('呈現時間到了才取出，依時間順序；還沒到的留著', () => {
    const entry = createRemoteEntry(view);
    entry.actions.push(melee(300, 'b'), melee(100, 'a'), melee(900, 'c'));
    expect(takeDueActions(entry, 50)).toEqual([]);
    expect(takeDueActions(entry, 500).map((a) => a.kind === 'melee' && a.move)).toEqual(['a', 'b']);
    expect(entry.actions).toHaveLength(1);
    expect(takeDueActions(entry, 900)).toHaveLength(1);
    expect(entry.actions).toHaveLength(0);
  });

  it('比呈現時間晚太久的動作直接丟掉（分頁在背景時累積的）', () => {
    const entry = createRemoteEntry(view);
    entry.actions.push(melee(0), melee(10_000));
    expect(takeDueActions(entry, 10_000 + NET.actionStaleMs - 1)).toHaveLength(1);
    expect(entry.actions).toHaveLength(0);
  });
});
