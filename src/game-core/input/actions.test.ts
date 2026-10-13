import { describe, expect, it } from 'vitest';
import keybindings from '@/data/keybindings.json';
import { buildCodeLookup, movementAxes, parseBindings, type ActionId } from './actions';

describe('按鍵綁定', () => {
  it('預設綁定檔可通過驗證並涵蓋規格 6.1 的按鍵', () => {
    const b = parseBindings(keybindings);
    expect(b.moveForward).toContain('KeyW');
    expect(b.jump).toContain('Space');
    expect(b.run).toContain('ShiftLeft');
    expect(b.interact).toContain('KeyE');
  });

  it('缺少動作時驗證失敗', () => {
    const rest: Record<string, unknown> = { ...keybindings };
    delete rest.jump;
    expect(() => parseBindings(rest)).toThrow();
  });

  it('反查表可由按鍵找到動作；重新綁定後生效', () => {
    const b = parseBindings({ ...keybindings, jump: ['KeyJ'] });
    const lookup = buildCodeLookup(b);
    expect(lookup.get('KeyJ')).toEqual(['jump']);
    expect(lookup.get('Space')).toBeUndefined();
  });
});

describe('movementAxes', () => {
  const axes = (down: ActionId[]) => movementAxes((a) => down.includes(a));
  it('相反方向互相抵消', () => {
    expect(axes(['moveLeft', 'moveRight'])).toEqual({ right: 0, forward: 0 });
  });
  it('前進加右移', () => {
    expect(axes(['moveForward', 'moveRight'])).toEqual({ right: 1, forward: 1 });
  });
});
