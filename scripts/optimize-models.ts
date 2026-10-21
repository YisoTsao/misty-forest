// 壓縮角色模型（使用者 2026-10-21：載入太慢）：五個 KayKit 角色各 3.6 MB，大部分是同一套 76 段動畫。
// 重新取樣動畫（去掉多餘的關鍵影格，誤差 1e-4）＋ meshopt 壓縮（EXT_meshopt_compression，
// drei 的 useGLTF 預設就會解碼），每個約 2 MB，再經資源包的 gzip 約 0.4 MB。
// 已經壓過的檔案（用了 EXT_meshopt_compression）會跳過，可以重複執行。
// 用法：node scripts/optimize-models.ts [目錄...]（預設 public/models/characters）
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const dirs = process.argv.slice(2);
if (dirs.length === 0) dirs.push('public/models/characters');

function glbFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return glbFiles(full);
    return e.name.endsWith('.glb') ? [full] : [];
  });
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

for (const file of dirs.flatMap(glbFiles)) {
  const before = statSync(file).size;
  const doc = await io.read(file);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) {
    console.log(`略過（已壓縮）${file}`);
    continue;
  }
  // 同 gltf-transform 的 meshopt({ level: 'high' })，但頂點位置不量化：量化會改掉武器節點的原點與縮放，
  // 揮砍拖尾（CharacterModel 的 bladeOf）是用模型局部座標的包圍盒找刀尖與握把
  await doc.transform(
    resample(),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ pattern: /^(TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/, patternTargets: /^(TEXCOORD|JOINTS|WEIGHTS|COLOR|NORMAL|TANGENT)(_\d+)?$/, quantizeNormal: 8 }),
  );
  // 動畫的旋轉、位移用 meshopt 的濾波（四元數、指數編碼），法向量用八面體編碼
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(file, doc);
  console.log(`${file}：${(before / 1024 / 1024).toFixed(2)} MB → ${(statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
}
