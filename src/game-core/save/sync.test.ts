import { describe, expect, it } from 'vitest';
import { planSync } from './sync';

const a = { savedAt: '2026-10-15T10:00:00.000Z', playTime: 1200 };
const b = { savedAt: '2026-10-16T10:00:00.000Z', playTime: 3000 };

describe('雲端存檔的同步判斷（任務 11G）', () => {
  it('兩邊都沒有：不動作', () => {
    expect(planSync(null, null)).toEqual({ kind: 'none' });
  });

  it('只有本機：上傳；只有雲端：下載', () => {
    expect(planSync(a, null)).toEqual({ kind: 'upload' });
    expect(planSync(null, b)).toEqual({ kind: 'download' });
  });

  it('同一版（savedAt 相同）：不動作', () => {
    expect(planSync(a, { ...a, playTime: 999 })).toEqual({ kind: 'none' });
  });

  it('兩邊不同版：一律問玩家，不自動選較新的（避免覆蓋掉玩家要的那份）', () => {
    expect(planSync(a, b)).toEqual({ kind: 'conflict', local: a, cloud: b });
    expect(planSync(b, a)).toEqual({ kind: 'conflict', local: b, cloud: a });
  });
});
