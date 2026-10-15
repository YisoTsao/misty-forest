// 遠端玩家的插值（任務 11B）：依收到快照的本機時間排序，呈現「現在 − 延遲」那一刻的位置，
// 在前後兩個快照之間線性內插、朝向取最短角，不在收到封包的瞬間直接跳座標。

export type Snapshot = { t: number; x: number; y: number; z: number; yaw: number };
export type Pose = { x: number; y: number; z: number; yaw: number };

const MAX_SNAPSHOTS = 32;
/** 兩個快照相距超過這麼遠（m）視為瞬移：清掉舊的，不從舊位置滑過去 */
export const SNAP_DISTANCE = 12;

/** 角度差取最短方向（弧度，結果在 -π..π） */
export function angleDelta(from: number, to: number): number {
  const d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) return d - Math.PI * 2;
  if (d < -Math.PI) return d + Math.PI * 2;
  return d;
}

export function lerpAngle(from: number, to: number, f: number): number {
  return from + angleDelta(from, to) * f;
}

/**
 * 對方時鐘與本機時鐘的差（本機收到時間 − 對方送出時間）。目標值取觀察到的最小值（延遲最短的那一包），
 * 每次更新允許慢慢往上調一點，時鐘漂移或網路變慢時也跟得上。
 * 實際使用的差值以有限的速度追上目標（slew），目標突然改變時畫面上只是暫時快或慢一點，不會一幀跳過去。
 */
export class ClockSync {
  private target: number | null = null;
  private applied: number | null = null;
  private lastLocal = 0;

  constructor(
    private readonly relaxPerUpdateMs = 0.25,
    /** 每經過 1 ms 本機時間，使用中的差值最多改變多少 ms（0.1 = 播放速度最多快 / 慢 10%） */
    private readonly maxSlew = 0.1,
  ) {}

  update(localNow: number, remoteT: number): number {
    const sample = localNow - remoteT;
    this.target = this.target === null ? sample : Math.min(sample, this.target + this.relaxPerUpdateMs);
    if (this.applied === null) {
      this.applied = this.target;
      this.lastLocal = localNow;
    }
    return this.target;
  }

  /** 本機某一刻對應的對方時間（尚未同步時為 null）；呼叫時讓使用中的差值往目標移動 */
  toRemote(localTime: number): number | null {
    if (this.target === null || this.applied === null) return null;
    const elapsed = Math.max(0, localTime - this.lastLocal);
    this.lastLocal = Math.max(this.lastLocal, localTime);
    const step = elapsed * this.maxSlew;
    const diff = this.target - this.applied;
    this.applied += Math.max(-step, Math.min(step, diff));
    return localTime - this.applied;
  }
}

export class SnapshotBuffer {
  private readonly items: Snapshot[] = [];

  /**
   * @param sendIntervalMs 對方移動時送出位置的間隔。停著時對方很久才送一次，
   * 兩個快照相隔超過兩倍間隔時，視為「一直停在原地，直到新快照的前一個間隔才開始動」。
   */
  constructor(private readonly sendIntervalMs = 50) {}

  get size(): number {
    return this.items.length;
  }

  push(s: Snapshot): void {
    const last = this.items[this.items.length - 1];
    if (last && s.t <= last.t) return;
    if (last && Math.hypot(s.x - last.x, s.z - last.z, s.y - last.y) > SNAP_DISTANCE) this.items.length = 0;
    // 停了一陣子後開始走：補一個「還在原地」的快照，否則會從很久以前的位置一路內插、開頭一幀跳過去
    else if (last && s.t - last.t > this.sendIntervalMs * 2) this.items.push({ ...last, t: s.t - this.sendIntervalMs });
    this.items.push(s);
    if (this.items.length > MAX_SNAPSHOTS) this.items.shift();
  }

  /** 某一刻的姿勢：在前後快照之間內插；比最早的還早就用最早的，比最新的還晚就停在最新的（不外插） */
  sample(t: number): Pose | null {
    const items = this.items;
    const first = items[0];
    if (!first) return null;
    if (t <= first.t) return pose(first);
    for (let i = 1; i < items.length; i++) {
      const b = items[i]!;
      if (t <= b.t) {
        const a = items[i - 1]!;
        const f = (t - a.t) / (b.t - a.t);
        return {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          z: a.z + (b.z - a.z) * f,
          yaw: lerpAngle(a.yaw, b.yaw, f),
        };
      }
    }
    return pose(items[items.length - 1]!);
  }
}

function pose(s: Snapshot): Pose {
  return { x: s.x, y: s.y, z: s.z, yaw: s.yaw };
}
