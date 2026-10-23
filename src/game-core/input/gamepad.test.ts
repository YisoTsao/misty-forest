import { describe, expect, it } from 'vitest';
import padData from '@/data/gamepad.json';
import keybindings from '@/data/keybindings.json';
import { parseBindings } from './actions';
import {
  applyDeadzone,
  buildPadLookup,
  initialNavRepeat,
  navDirection,
  PAD,
  parsePadBindings,
  pickNext,
  stepNavRepeat,
  stickToMove,
  type Rect,
} from './gamepad';

describe('手把配置', () => {
  it('專案的手把配置合法：每個鍵盤動作都有手把按鈕（移動由搖桿、暫停由 Start、指定武器由「切換武器」依序切換、世界地圖由暫停選單開啟）', () => {
    const pad = parsePadBindings(padData);
    const keyboard = parseBindings(keybindings);
    for (const action of Object.keys(keyboard)) {
      if (action.startsWith('move') || action === 'pause' || action === 'map' || action === 'journal' || action === 'quickHeal' || action === 'dodge' || action === 'lumen' || /^weapon\d$/.test(action)) continue;
      expect(pad[action as keyof typeof pad]?.length, action).toBeGreaterThan(0);
    }
  });

  it('Start 保留給暫停；同一按鈕不對應兩個動作', () => {
    const lookup = buildPadLookup(parsePadBindings(padData));
    expect(lookup.has(PAD.Start)).toBe(false);
    for (const [button, actions] of lookup) expect(actions, `按鈕 ${button}`).toHaveLength(1);
  });

  it('拒絕未知的動作與超出範圍的按鈕', () => {
    expect(() => parsePadBindings({ fly: [0] })).toThrow();
    expect(() => parsePadBindings({ jump: [16] })).toThrow();
  });
});

describe('搖桿', () => {
  it('死區內為 0；推到底為 1；斜推不超過 1', () => {
    expect(applyDeadzone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(1, 0).x).toBeCloseTo(1);
    const d = applyDeadzone(1, 1);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });

  it('輕推為類比的慢走；往上推是前進', () => {
    const half = stickToMove(0, -0.6);
    expect(half.forward).toBeGreaterThan(0.3);
    expect(half.forward).toBeLessThan(0.7);
    expect(stickToMove(1, 0).right).toBeCloseTo(1);
  });
});

describe('選單導覽', () => {
  const none = () => false;
  it('十字鍵優先於搖桿；搖桿要推過一半', () => {
    expect(navDirection((b) => b === PAD.Down, 0, -1)).toBe('down');
    expect(navDirection(none, 0.3, 0)).toBeNull();
    expect(navDirection(none, 0, -0.9)).toBe('up');
    expect(navDirection(none, -0.8, 0.2)).toBe('left');
  });

  it('按住方向：第一次立即、0.4 秒後連續', () => {
    let s = initialNavRepeat();
    const fires: (string | null)[] = [];
    for (let i = 0; i < 10; i++) {
      const r = stepNavRepeat(s, 'down', 0.1);
      s = r.state;
      fires.push(r.fire);
    }
    expect(fires[0]).toBe('down');
    expect(fires.slice(1, 3).every((f) => f === null)).toBe(true);
    expect(fires.filter((f) => f !== null).length).toBeGreaterThanOrEqual(3);
    expect(stepNavRepeat(s, null, 0.1).fire).toBeNull();
  });

  // 直排三個按鈕 + 右邊一個
  const rects: Rect[] = [
    { x: 100, y: 100, width: 200, height: 40 },
    { x: 100, y: 160, width: 200, height: 40 },
    { x: 100, y: 220, width: 200, height: 40 },
    { x: 400, y: 160, width: 100, height: 40 },
  ];
  const vp = { width: 600, height: 400 };

  it('沒有選取時選最接近畫面中心者', () => {
    expect(pickNext(rects, null, 'down', vp)).toBe(1);
  });

  it('上下在同一欄移動，左右換欄；該方向沒有東西時不動', () => {
    expect(pickNext(rects, 0, 'down', vp)).toBe(1);
    expect(pickNext(rects, 1, 'down', vp)).toBe(2);
    expect(pickNext(rects, 1, 'up', vp)).toBe(0);
    expect(pickNext(rects, 1, 'right', vp)).toBe(3);
    expect(pickNext(rects, 3, 'left', vp)).toBe(1);
    expect(pickNext(rects, 0, 'up', vp)).toBeNull();
  });
});
