import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { worldIndex } from '@/game/authority';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { currentScreen } from '@/game/state/gameStore';
import { LIGHTHOUSE_LAMP, lighthouseVisual } from '@/game/world/lighthouseRuntime';
import { currentTimeLook, nightAmount } from '@/render/timeLook';

/** 光柱的長度與末端半徑（公尺）、旋轉速度（弧度 / 秒）、燈芯在燈籠室原點上方的高度 */
const BEAM_LENGTH = 34;
const BEAM_RADIUS = 3;
const SPIN = 0.45;
const LAMP_Y = 0.95;

const vertex = /* glsl */ `
  varying float vAlong;
  varying float vFacing;
  void main() {
    vAlong = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // 側面看最清楚、沿著光柱看（或站在光柱裡）幾乎看不到，避免整個畫面被加亮
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;
const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlong;
  varying float vFacing;
  void main() {
    // 燈芯附近最亮，往外逐漸淡出
    float a = pow(vAlong, 2.0) * pow(vFacing, 2.0) * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/**
 * 晨曦燈塔的光柱（任務 7D，Bible §5.6 fx_lighthouse_reawaken）：燈塔點亮後，塔頂兩道金色光柱慢慢旋轉。
 * 白天很淡、黃昏到夜晚明顯（依時段的 glow）。沒點亮前不建立。
 */
export function LighthouseBeam() {
  const lit = useGameStateStore((s) => s.state.objects.get(LIGHTHOUSE_LAMP)?.repaired === true);
  return lit ? <Beam /> : null;
}

function Beam() {
  const placement = worldIndex.placement(LIGHTHOUSE_LAMP);
  if (!placement) throw new Error(`找不到燈塔的燈籠室：${LIGHTHOUSE_LAMP}`);
  const group = useRef<THREE.Group>(null);
  const { geometry, material } = useMemo(() => {
    // 圓錐：尖端在原點、沿 +X 展開；uv.y 在尖端為 1、末端為 0
    const g = new THREE.ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, 24, 1, true);
    g.translate(0, -BEAM_LENGTH / 2, 0);
    g.rotateZ(Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffd98a') }, uOpacity: { value: 0 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    return { geometry: g, material: m };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useEffect(() => {
    lighthouseVisual.beam = true;
    return () => {
      lighthouseVisual.beam = false;
    };
  }, []);
  const local = useMemo(() => ({ angle: 0, appear: 0 }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    if (currentScreen() !== 'paused') {
      local.angle += SPIN * dt;
      local.appear = Math.min(1, local.appear + dt / 2.5);
    }
    if (group.current) group.current.rotation.y = local.angle;
    // 白天淡淡的、夜晚明亮
    material.uniforms.uOpacity!.value = (0.05 + 0.3 * nightAmount(currentTimeLook)) * local.appear;
  });

  const [x, y, z] = placement.position;
  return (
    <group ref={group} position={[x, y + LAMP_Y, z]}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
      <mesh geometry={geometry} material={material} rotation-y={Math.PI} frustumCulled={false} />
    </group>
  );
}
