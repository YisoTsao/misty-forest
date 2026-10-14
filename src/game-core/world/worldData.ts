import { z } from 'zod';
import { placementSchema, prefabSchema, type Placement, type Prefab } from './types';

export type WorldData = {
  prefabs: ReadonlyMap<string, Prefab>;
  placements: readonly Placement[];
};

export class WorldDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldDataError';
  }
}

/**
 * 驗證並組合 prefab 與 placement 資料。
 * 失敗時拋出 WorldDataError（訊息列出問題），不得默默略過壞資料。
 */
export function parseWorldData(rawPrefabs: unknown, rawPlacements: unknown): WorldData {
  const prefabList = z.array(prefabSchema).safeParse(rawPrefabs);
  if (!prefabList.success) throw new WorldDataError(`prefabs 資料格式錯誤：${z.prettifyError(prefabList.error)}`);
  const placementList = z.array(placementSchema).safeParse(rawPlacements);
  if (!placementList.success) throw new WorldDataError(`placements 資料格式錯誤：${z.prettifyError(placementList.error)}`);

  const prefabs = new Map<string, Prefab>();
  for (const prefab of prefabList.data) {
    if (prefabs.has(prefab.id)) throw new WorldDataError(`prefab id 重複：${prefab.id}`);
    prefabs.set(prefab.id, prefab);
  }

  const seen = new Set<string>();
  for (const placement of placementList.data) {
    if (seen.has(placement.id)) throw new WorldDataError(`placement id 重複：${placement.id}`);
    seen.add(placement.id);
    if (!prefabs.has(placement.prefabId)) {
      throw new WorldDataError(`placement ${placement.id} 參照不存在的 prefab：${placement.prefabId}`);
    }
  }

  return { prefabs, placements: placementList.data };
}

/** 依 prefab 分組，供 instanced 渲染使用。 */
export function groupPlacementsByPrefab(placements: readonly Placement[]): Map<string, Placement[]> {
  const groups = new Map<string, Placement[]>();
  for (const p of placements) {
    const list = groups.get(p.prefabId);
    if (list) list.push(p);
    else groups.set(p.prefabId, [p]);
  }
  return groups;
}

/** 渲染分塊的邊長（公尺）：每塊各自一組 InstancedMesh，視錐外的區塊由 three 剔除（任務 7A 地圖變大） */
export const RENDER_CHUNK_SIZE = 64;

/** 依水平位置把 placement 分到渲染區塊；回傳 [區塊 key, placements]，順序固定。 */
export function chunkPlacements(placements: readonly Placement[], size = RENDER_CHUNK_SIZE): [string, Placement[]][] {
  const chunks = new Map<string, Placement[]>();
  for (const p of placements) {
    const key = `${Math.floor(p.position[0] / size)},${Math.floor(p.position[2] / size)}`;
    const list = chunks.get(key);
    if (list) list.push(p);
    else chunks.set(key, [p]);
  }
  return [...chunks.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
