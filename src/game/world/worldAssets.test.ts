// 世界物件的模型檔檢查：路徑存在、外部 buffer / 貼圖存在、寶箱有可動的蓋子節點、環境動畫的節點存在。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import prefabs from '@/data/prefabs.json';
import { buildProceduralModel, PROCEDURAL_PREFIX, sheepParts } from '@/render/proceduralModels';

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

  // 環境動畫（風車扇葉、曬衣繩的衣服）：指定的節點必須存在，否則動畫會默默失效
  for (const p of prefabs) {
    for (const anim of p.animate ?? []) {
      it(`${p.id}：環境動畫的節點 ${anim.node} 存在`, () => {
        const names = p.model.startsWith(PROCEDURAL_PREFIX)
          ? buildProceduralModel(p.model).map((part) => part.name)
          : (readGltfJson(path.join('public', p.model)).nodes ?? []).map((n) => n.name);
        expect(names).toContain(anim.node);
      });
    }
  }

  it('羊的模型有身體、頭與兩組腿', () => {
    const parts = sheepParts();
    expect(parts.map((p) => p.name)).toEqual(['body', 'head', 'legsA', 'legsB']);
    parts.forEach((p) => p.geometry.dispose());
  });
});

// 任務 7C：怪物模型存在、動作使用的動畫片段都在模型裡
describe('enemy models', async () => {
  const enemies = (await import('@/data/enemies.json')).default as { id: string; model?: { path: string; clips: Record<string, string>; colors?: Record<string, string> } }[];
  for (const e of enemies) {
    if (!e.model) continue;
    const { path: model, clips, colors } = e.model;
    it(`${e.id}：模型存在、${Object.keys(clips).length} 個動作的動畫片段與染色材質都存在`, () => {
      const file = path.join('public', model);
      expect(existsSync(file), file).toBe(true);
      const json = readGltfJson(file) as GltfJson & { animations?: { name?: string }[]; materials?: { name?: string }[]; skins?: unknown[] };
      expect(json.skins?.length ?? 0).toBeGreaterThan(0);
      const names = new Set((json.animations ?? []).map((a) => a.name));
      for (const clip of Object.values(clips)) expect(names.has(clip), clip).toBe(true);
      const mats = new Set((json.materials ?? []).map((m) => m.name));
      for (const m of Object.keys(colors ?? {})) expect(mats.has(m), m).toBe(true);
    });
  }
});
