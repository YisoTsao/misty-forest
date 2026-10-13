import { describe, expect, it, vi } from 'vitest';
import { countItem } from '../inventory/inventory';
import { testContext } from '../testing/fixtures';
import { LocalAuthority } from './authority';
import { initialGameState, type GameEvent } from './rules';

describe('LocalAuthority', () => {
  it('送出指令後更新狀態並通知訂閱者', () => {
    const authority = new LocalAuthority(initialGameState(), testContext());
    const received: GameEvent[][] = [];
    authority.subscribe((events) => received.push([...events]));
    authority.send({ type: 'HarvestObject', placementId: 't1' });
    expect(received[0]?.map((e) => e.type)).toEqual(['ObjectHarvested', 'ItemsGained']);
    expect(countItem(authority.getState().inventory, 'wood')).toBe(2);
  });

  it('被拒絕的指令只通知、不改變狀態', () => {
    const authority = new LocalAuthority(initialGameState(), testContext());
    const before = authority.getState();
    const listener = vi.fn();
    authority.subscribe(listener);
    authority.send({ type: 'OpenChest', placementId: 't1' });
    expect(listener).toHaveBeenCalledOnce();
    expect(authority.getState().objects).toBe(before.objects);
    expect(authority.getState().inventory).toBe(before.inventory);
  });

  it('replaceState 替換狀態並通知；取消訂閱後不再收到', () => {
    const authority = new LocalAuthority(initialGameState(), testContext());
    authority.send({ type: 'HarvestObject', placementId: 't1' });
    const listener = vi.fn();
    const off = authority.subscribe(listener);
    authority.replaceState(initialGameState());
    expect(listener).toHaveBeenCalledWith([], authority.getState());
    expect(authority.getState().objects.size).toBe(0);
    off();
    authority.send({ type: 'HarvestObject', placementId: 't1' });
    expect(listener).toHaveBeenCalledOnce();
  });
});
