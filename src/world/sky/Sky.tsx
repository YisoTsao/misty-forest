import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createMistLook, mistLook, uMist } from '@/render/mist';
import { palette } from '@/render/palette';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
    // 地平線下方延續地平線色，與霧融合
    col = vDir.y < 0.0 ? uHorizon : col;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** 風格化漸層天空球（規格 4.3）。固定跟隨相機，不參與物理；顏色跟隨 uMist。 */
export function Sky() {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uZenith: { value: new THREE.Color(palette.skyZenith) },
          uHorizon: { value: new THREE.Color(palette.skyHorizon) },
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);
  const look = useMemo(() => createMistLook(), []);

  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
    // 迷霧時天空轉灰並與霧色融合（規格 4.5）
    mistLook(uMist.value, look);
    (material.uniforms.uZenith!.value as THREE.Color).copy(look.skyZenith);
    (material.uniforms.uHorizon!.value as THREE.Color).copy(look.skyHorizon);
  });

  return (
    <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[450, 32, 16]} />
    </mesh>
  );
}
