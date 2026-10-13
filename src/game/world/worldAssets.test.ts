// 世界物件的模型檔檢查：路徑存在、外部 buffer / 貼圖存在、寶箱有可動的蓋子節點。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import prefabs from '@/data/prefabs.json';
import { buildProceduralModel, PROCEDURAL_PREFIX } from '@/render/proceduralModels';

type GltfJson = { nodes?: { name?: string }[]; buffers?: { uri?: string }[]; images?: { uri?: string }[] };

function readGltfJson(file: string): GltfJson {
  const buf = readFileSync(file);
  if (file.endsWith('.gltf')) return JSON.parse(buf.toString('utf8')) as GltfJson;
  // GLB：12 bytes 標頭 + 第一個 chunk（JSON）
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson;
}

describe('world prefab assets', () => {
  // 每個 prefab 的模型，加上採集後留下的模型（樹樁）與修復後的模型（木橋）
  const models = prefabs.flatMap((p) => [
    { label: p.id, model: p.model },
    ...(p.harvest?.harvestedModel ? [{ label: `${p.id}（採集後）`, model: p.harvest.harvestedModel }] : []),
    ...(p.repair ? [{ label: `${p.id}（修復後）`, model: p.repair.model }] : []),
  ]);
  for (const { label, model } of models) {
    if (model.startsWith(PROCEDURAL_PREFIX)) {
      it(`${label}：程式模型可建立且有幾何`, () => {
        const parts = buildProceduralModel(model);
        expect(parts.length).toBeGreaterThan(0);
        for (const part of parts) {
          expect(part.geometry.getAttribute('position').count).toBeGreaterThan(0);
          part.geometry.dispose();
          part.material.dispose();
        }
      });
      continue;
    }
    const file = path.join('public', model);

    it(`${label}：模型與其外部檔案都存在`, () => {
      expect(existsSync(file), file).toBe(true);
      const json = readGltfJson(file);
      const external = [...(json.buffers ?? []), ...(json.images ?? [])]
        .map((r) => r.uri)
        .filter((uri): uri is string => uri !== undefined && !uri.startsWith('data:'));
      for (const uri of external) expect(existsSync(path.join(path.dirname(file), uri)), uri).toBe(true);
    });
  }

  it('寶箱模型有 chest_lid 節點（開蓋動畫用）', () => {
    const chest = prefabs.find((p) => p.entity === 'chest');
    expect(chest).toBeDefined();
    const json = readGltfJson(path.join('public', chest!.model));
    expect(json.nodes?.some((n) => n.name === 'chest_lid')).toBe(true);
  });
});
