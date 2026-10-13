import { describe, expect, it } from 'vitest';
import keybindings from '@/data/keybindings.json';
import { buildCodeLookup, movementAxes, parseBindings, rebind, type ActionId, type Bindings } from './actions';

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

describe('rebind', () => {
  const defaults = parseBindings(keybindings);
  const ok = (r: ReturnType<typeof rebind>) => {
    if ('error' in r) throw new Error(r.error);
    return r;
  };

  it('取代主要按鍵，保留次要按鍵', () => {
    const { bindings } = ok(rebind(defaults, 'moveForward', 0, 'KeyZ'));
    expect(bindings.moveForward).toEqual(['KeyZ', 'ArrowUp']);
    expect(defaults.moveForward).toEqual(['KeyW', 'ArrowUp']); // 不修改輸入
  });

  it('按鍵已被其他動作使用時從該動作移除，並回報被影響的動作', () => {
    const { bindings, displaced } = ok(rebind(defaults, 'jump', 0, 'KeyE'));
    expect(bindings.jump).toEqual(['KeyE']);
    expect(bindings.interact).toEqual([]);
    expect(displaced).toEqual(['interact']);
    // 反查表中 KeyE 只對應跳躍
    expect(buildCodeLookup(bindings).get('KeyE')).toEqual(['jump']);
  });

  it('設定為自己另一格已有的按鍵時不會重複', () => {
    const { bindings } = ok(rebind(defaults, 'moveForward', 1, 'KeyW'));
    expect(bindings.moveForward).toEqual(['KeyW']);
  });

  it('設定次要按鍵與清除', () => {
    let b: Bindings = ok(rebind(defaults, 'interact', 1, 'KeyF')).bindings;
    expect(b.interact).toEqual(['KeyE', 'KeyF']);
    b = ok(rebind(b, 'interact', 0, null)).bindings;
    expect(b.interact).toEqual(['KeyF']); // 次要往前補
    expect(rebind(b, 'interact', 0, null)).toEqual({ error: 'last-key' });
  });

  it('Esc 保留給暫停與關閉視窗；暫停不能重新配置', () => {
    expect(rebind(defaults, 'jump', 0, 'Escape')).toEqual({ error: 'reserved' });
    expect(rebind(defaults, 'pause', 0, 'KeyP')).toEqual({ error: 'not-rebindable' });
  });

  it('滑鼠按鍵也可以綁定', () => {
    const { bindings, displaced } = ok(rebind(defaults, 'interact', 0, 'Mouse0'));
    expect(bindings.interact[0]).toBe('Mouse0');
    expect(displaced).toEqual(['attack']);
  });
});
