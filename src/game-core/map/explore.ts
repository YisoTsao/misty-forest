// 世界地圖的探索紀錄（Bible §31.3：尚未探索區域以低細節霧罩顯示，不用全黑遮住）。
// 地圖切成 8 m 的格子，以位元組紀錄是否走過；玩家附近 REVEAL_RADIUS 內的格子視為已探索。
// 權威狀態的一部分（存檔 v11 `map.explored`）；純函式，不修改輸入。
import { TERRAIN_SIZE } from '../world/terrain';

export const EXPLORE_CELL = 8;
export const EXPLORE_GRID = Math.ceil(TERRAIN_SIZE / EXPLORE_CELL);
export const EXPLORE_CELLS = EXPLORE_GRID * EXPLORE_GRID;
/** 玩家周圍這個半徑內的格子算是看過了 */
export const REVEAL_RADIUS = 26;

/** 探索紀錄：每格 1 bit */
export type Explored = Uint8Array;

export function createExplored(): Explored {
  return new Uint8Array(Math.ceil(EXPLORE_CELLS / 8));
}

/** 世界座標 → 格子索引；地圖外回傳 null */
export function cellIndexAt(x: number, z: number): number | null {
  const i = Math.floor((x + TERRAIN_SIZE / 2) / EXPLORE_CELL);
  const j = Math.floor((z + TERRAIN_SIZE / 2) / EXPLORE_CELL);
  if (i < 0 || j < 0 || i >= EXPLORE_GRID || j >= EXPLORE_GRID) return null;
  return j * EXPLORE_GRID + i;
}

/** 格子中心的世界座標 */
export function cellCenter(index: number): { x: number; z: number } {
  const i = index % EXPLORE_GRID;
  const j = Math.floor(index / EXPLORE_GRID);
  return { x: (i + 0.5) * EXPLORE_CELL - TERRAIN_SIZE / 2, z: (j + 0.5) * EXPLORE_CELL - TERRAIN_SIZE / 2 };
}

export function isCellExplored(bits: Explored, index: number): boolean {
  return (bits[index >> 3]! & (1 << (index & 7))) !== 0;
}

export function isExploredAt(bits: Explored, x: number, z: number): boolean {
  const index = cellIndexAt(x, z);
  return index !== null && isCellExplored(bits, index);
}

/** 站在 (x, z) 時新看到、還沒紀錄的格子（格子中心在半徑內） */
export function cellsToReveal(bits: Explored, x: number, z: number, radius = REVEAL_RADIUS): number[] {
  const out: number[] = [];
  const r = Math.ceil(radius / EXPLORE_CELL) + 1;
  const center = cellIndexAt(x, z);
  if (center === null) return out;
  const ci = center % EXPLORE_GRID;
  const cj = Math.floor(center / EXPLORE_GRID);
  for (let j = Math.max(0, cj - r); j <= Math.min(EXPLORE_GRID - 1, cj + r); j++) {
    for (let i = Math.max(0, ci - r); i <= Math.min(EXPLORE_GRID - 1, ci + r); i++) {
      const index = j * EXPLORE_GRID + i;
      if (isCellExplored(bits, index)) continue;
      const c = cellCenter(index);
      if (Math.hypot(c.x - x, c.z - z) <= radius) out.push(index);
    }
  }
  return out;
}

/** 回傳加上這些格子的新紀錄（不修改輸入）；無效索引略過 */
export function withCells(bits: Explored, cells: readonly number[]): Explored {
  const next = new Uint8Array(bits);
  for (const c of cells) if (Number.isInteger(c) && c >= 0 && c < EXPLORE_CELLS) next[c >> 3]! |= 1 << (c & 7);
  return next;
}

/** 已探索的比例（0–1） */
export function exploredRatio(bits: Explored): number {
  let n = 0;
  for (let c = 0; c < EXPLORE_CELLS; c++) if (isCellExplored(bits, c)) n++;
  return n / EXPLORE_CELLS;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 存檔用的 base64（不依賴 btoa / Buffer，伺服器與瀏覽器都能用） */
export function encodeExplored(bits: Explored): string {
  let out = '';
  for (let i = 0; i < bits.length; i += 3) {
    const a = bits[i]!;
    const b = bits[i + 1] ?? 0;
    const c = bits[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bits.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < bits.length ? B64[n & 63]! : '=');
  }
  return out;
}

/** 讀回探索紀錄；長度不符（例如地圖大小改變）或格式錯誤時回傳 null，由呼叫端決定如何處理 */
export function decodeExplored(text: string): Explored | null {
  const clean = text.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes.push((buffer >> bitsInBuffer) & 0xff);
    }
  }
  const expected = Math.ceil(EXPLORE_CELLS / 8);
  if (bytes.length !== expected) return null;
  return Uint8Array.from(bytes);
}
