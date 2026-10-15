import { describe, expect, it } from 'vitest';
import { AdaptiveDelay, angleDelta, ClockSync, lerpAngle, SnapshotBuffer } from './interpolation';

describe('遠端玩家插值', () => {
  it('在前後快照之間線性內插', () => {
    const b = new SnapshotBuffer();
    b.push({ t: 0, x: 0, y: 0, z: 0, yaw: 0 });
    b.push({ t: 100, x: 1, y: 0, z: 2, yaw: 0 });
    expect(b.sample(50)).toEqual({ x: 0.5, y: 0, z: 1, yaw: 0 });
  });

  it('早於第一筆用第一筆、晚於最後一筆停在最後一筆（不外插）', () => {
    const b = new SnapshotBuffer();
    expect(b.sample(0)).toBeNull();
    b.push({ t: 10, x: 1, y: 0, z: 0, yaw: 0 });
    b.push({ t: 20, x: 2, y: 0, z: 0, yaw: 0 });
    expect(b.sample(0)?.x).toBe(1);
    expect(b.sample(500)?.x).toBe(2);
  });

  it('忽略時間倒退的快照；距離太遠視為瞬移、不滑過去', () => {
    const b = new SnapshotBuffer();
    b.push({ t: 10, x: 0, y: 0, z: 0, yaw: 0 });
    b.push({ t: 5, x: 9, y: 0, z: 0, yaw: 0 });
    expect(b.size).toBe(1);
    b.push({ t: 20, x: 2000, y: 0, z: 0, yaw: 0 });
    expect(b.size).toBe(1);
    expect(b.sample(15)?.x).toBe(2000);
  });

  it('朝向取最短的方向轉', () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(lerpAngle(0.1, -0.1, 0.5)).toBeCloseTo(0);
    expect(angleDelta(0, 4 * Math.PI + 0.3)).toBeCloseTo(0.3);
  });

  it('時鐘差取延遲最短的那一包，慢慢往上調', () => {
    const c = new ClockSync(0.5, 1);
    expect(c.toRemote(0)).toBeNull();
    expect(c.update(1000, 100)).toBe(900);
    expect(c.update(1080, 150)).toBe(900.5); // 這包比較慢（差 930），目標只往上調 0.5
    expect(c.update(1100, 250)).toBe(850); // 更快的一包
  });

  it('目標改變時，使用中的差值以有限速度追上，不會一下跳過去', () => {
    const c = new ClockSync(0, 0.1);
    c.update(1000, 0); // 差 1000
    expect(c.toRemote(1000)).toBe(0);
    c.update(1010, 50); // 目標變成 960（快了 40 ms）
    // 距離上次取用經過 110 ms，最多追 11 ms
    expect(c.toRemote(1110)).toBeCloseTo(1110 - 989);
    // 再經過 1 秒就追上
    expect(c.toRemote(2110)).toBeCloseTo(2110 - 960);
  });

  it('依送出端時間插值：封包成堆抵達時速度仍然平均', () => {
    const b = new SnapshotBuffer();
    // 送出端每 50 ms 走 0.3 m（6 m/s）；不管什麼時候收到，快照的時間都是送出時間
    for (let i = 0; i <= 10; i++) b.push({ t: i * 50, x: i * 0.3, y: 0, z: 0, yaw: 0 });
    const speeds: number[] = [];
    for (let t = 10; t < 490; t += 16) speeds.push((b.sample(t + 16)!.x - b.sample(t)!.x) / 0.016);
    expect(Math.max(...speeds)).toBeCloseTo(6, 5);
    expect(Math.min(...speeds)).toBeCloseTo(6, 5);
  });

  it('停了一陣子後開始走：補一個還在原地的快照，開頭不會跳', () => {
    const b = new SnapshotBuffer(50);
    b.push({ t: 0, x: 0, y: 0, z: 0, yaw: 0 }); // 停著（1 秒才送一次）
    b.push({ t: 1000, x: 0.15, y: 0, z: 0, yaw: 0 }); // 開始走後的第一筆
    expect(b.size).toBe(3);
    expect(b.sample(940)?.x).toBe(0);
    expect(b.sample(975)?.x).toBeCloseTo(0.075);
  });
});

describe('依抖動調整的呈現延遲（任務 11C）', () => {
  it('網路穩定時維持基本延遲 100 ms', () => {
    const d = new AdaptiveDelay();
    for (let i = 0; i < 40; i++) d.observe(i % 3);
    expect(d.targetMs).toBe(100);
    expect(d.current(0)).toBe(100);
    expect(d.current(1000)).toBe(100);
  });

  it('封包常常晚到約 100 ms：目標拉長到能涵蓋，且很快調上去', () => {
    const d = new AdaptiveDelay();
    d.current(0);
    for (let i = 0; i < 40; i++) d.observe(i % 4 === 0 ? 110 : 5);
    expect(d.targetMs).toBe(180);
    // 往上調：0.5 ms / ms，160 ms 後到位
    expect(d.current(100)).toBeCloseTo(150, 5);
    expect(d.current(400)).toBe(180);
  });

  it('不超過上限；抖動消失後慢慢縮回基本延遲', () => {
    const d = new AdaptiveDelay();
    d.current(0);
    for (let i = 0; i < 40; i++) d.observe(800);
    expect(d.targetMs).toBe(300);
    expect(d.current(1000)).toBe(300);
    for (let i = 0; i < 40; i++) d.observe(0);
    expect(d.targetMs).toBe(100);
    // 往下調：0.05 ms / ms，1 秒只縮 50 ms
    expect(d.current(2000)).toBeCloseTo(250, 5);
    expect(d.current(10_000)).toBe(100);
  });
});
