import * as THREE from 'three';

/**
 * 攝影機遮擋淡出：世界物件（樹、岩石、建築）落在「攝影機附近」或「攝影機與角色之間的管狀範圍」時，
 * 以 4×4 Bayer 網點逐漸鏤空（不需要半透明排序）。解決茂密森林裡攝影機鑽進樹冠、或樹冠擋住角色的問題；
 * 樹幹仍由攝影機 shape cast 避讓。陰影不受影響（陰影使用另一份深度材質）。
 * FollowCamera 每幀更新 uniform；自由視角時停用。
 */
export const occlusionUniforms = {
  uOccCam: { value: new THREE.Vector3() },
  uOccFocus: { value: new THREE.Vector3() },
  uOccEnabled: { value: 0 },
};

const VERTEX_DECL = /* glsl */ `
  varying vec3 vOccWorld;
`;
const VERTEX_BODY = /* glsl */ `
  #ifdef USE_INSTANCING
    vOccWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vOccWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
`;
const FRAGMENT_DECL = /* glsl */ `
  uniform vec3 uOccCam;
  uniform vec3 uOccFocus;
  uniform float uOccEnabled;
  varying vec3 vOccWorld;
  float occBayer(vec2 p) {
    ivec2 i = ivec2(mod(p, 4.0));
    int idx = i.x + i.y * 4;
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[idx]) + 0.5) / 16.0;
  }
`;
const FRAGMENT_BODY = /* glsl */ `
  if (uOccEnabled > 0.5) {
    vec3 seg = uOccFocus - uOccCam;
    float len = max(length(seg), 1e-3);
    vec3 dir = seg / len;
    float t = clamp(dot(vOccWorld - uOccCam, dir), 0.0, len);
    float tube = length(vOccWorld - (uOccCam + dir * t));
    // 攝影機與角色之間（不含角色身邊）的管狀範圍
    float between = (1.0 - smoothstep(0.8, 1.7, tube)) * (1.0 - smoothstep(0.75, 0.9, t / len));
    // 緊貼攝影機的東西
    float near = 1.0 - smoothstep(1.4, 2.6, distance(vOccWorld, uOccCam));
    float fade = max(between, near) * 0.92;
    if (fade > occBayer(gl_FragCoord.xy)) discard;
  }
`;

export function patchOcclusion<T extends THREE.Material>(material: T): T {
  if (material.userData.occlusionPatched) return material;
  material.userData.occlusionPatched = true;
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, occlusionUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAGMENT_BODY}`);
  };
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|occlusion`;
  return material;
}
