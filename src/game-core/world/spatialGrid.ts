// 水平面均勻格網：給「找出玩家附近的物件」用（碰撞體啟用、互動目標）。
// 規格 6.2 / 7：以空間查詢取代每幀對所有物件做射線或距離計算。

export type GridItem = { readonly x: number; readonly z: number };

export class SpatialGrid<T extends GridItem> {
  private readonly cells = new Map<string, T[]>();

  constructor(
    items: Iterable<T>,
    private readonly cellSize: number,
  ) {
    if (!(cellSize > 0)) throw new Error(`cellSize 必須為正數：${cellSize}`);
    for (const item of items) {
      const key = this.key(this.cell(item.x), this.cell(item.z));
      const list = this.cells.get(key);
      if (list) list.push(item);
      else this.cells.set(key, [item]);
    }
  }

  /** 回傳水平距離 ≤ radius 的項目，寫入 out（會先清空）以便重複使用陣列。 */
  query(x: number, z: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const r2 = radius * radius;
    const x0 = this.cell(x - radius);
    const x1 = this.cell(x + radius);
    const z0 = this.cell(z - radius);
    const z1 = this.cell(z + radius);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const item of list) {
          const dx = item.x - x;
          const dz = item.z - z;
          if (dx * dx + dz * dz <= r2) out.push(item);
        }
      }
    }
    return out;
  }

  private cell(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }
}
