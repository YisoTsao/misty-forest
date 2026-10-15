import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { WeaponId } from '@/game-core/combat/weapons';
import { authority, weapons } from '@/game/authority';
import { combatRuntime, type TrailSample } from '@/game/combat/combatRuntime';
import { sparkTexture } from '@/render/sparkTexture';

/**
 * 近戰打擊感特效（GAME_DESIGN 5.3）：
 * - 揮砍拖尾：刀、劍揮動時，刀尖到刀身的掃過區域留下漸淡的光帶（加法混合、HDR 觸發 Bloom）。
 * - 命中衝擊：刀劍是火花放射 + 光環；拳腳是向外擴散的衝擊塵環。
 * 幾何與材質預先配置、每幀只更新頂點與 uniform（不 setState）。
 */

const MAX_SAMPLES = 32;
const TRAIL_LIFE = 0.14;

/** 拖尾的取樣與武器（決定顏色與寬度）；預設是本機玩家 */
type TrailSource = () => { samples: readonly TrailSample[]; weapon: WeaponId };
const localTrail: TrailSource = () => ({ samples: combatRuntime.trail, weapon: authority.getState().player.weapon });

/** 揮砍拖尾；其他玩家（任務 11E）傳入自己的取樣 */
export function WeaponTrail({ source = localTrail }: { source?: TrailSource }) {
  const mesh = useRef<THREE.Mesh>(null);
  const assets = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_SAMPLES * 2 * 3);
    const fade = new Float32Array(MAX_SAMPLES * 2);
    const along = new Float32Array(MAX_SAMPLES * 2);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aFade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    const index: number[] = [];
    for (let i = 0; i < MAX_SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    for (let i = 0; i < MAX_SAMPLES; i++) along.set([1, 0], i * 2);
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(2, 2, 2) } },
      vertexShader: /* glsl */ `
        attribute float aFade;
        attribute float aAlong;
        varying float vFade;
        varying float vAlong;
        void main() {
          vFade = aFade;
          vAlong = aAlong;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vFade;
        varying float vAlong;
        void main() {
          // 刀尖最亮、往刀柄淡出；越舊的取樣越透明
          float a = vFade * vFade * smoothstep(0.0, 0.85, vAlong);
          vec3 core = mix(uColor, vec3(3.0), smoothstep(0.75, 1.0, vAlong) * vFade);
          gl_FragColor = vec4(core, a * 0.85);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    return { geometry, material, positions, fade };
  }, []);
  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );

  const warm = useRef(3);
  useFrame(() => {
    const { samples, weapon: weaponId } = source();
    const m = mesh.current;
    if (!m) return;
    // 前幾幀以全透明畫一次，shader 在載入時編譯，第一次揮砍不會卡頓
    if (warm.current > 0) {
      warm.current--;
      m.visible = true;
      assets.fade.fill(0);
      assets.geometry.attributes.aFade!.needsUpdate = true;
      return;
    }
    const weapon = weapons.weapons.get(weaponId);
    if (samples.length < 2 || !weapon?.trail) {
      m.visible = false;
      return;
    }
    m.visible = true;
    const [r, g, b] = weapon.trail.color;
    (assets.material.uniforms.uColor!.value as THREE.Color).setRGB(r, g, b);
    const n = Math.min(samples.length, MAX_SAMPLES);
    const start = samples.length - n;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      // 不足的部分重複最後一個取樣（退化成看不見的三角形）
      const s = samples[start + Math.min(i, n - 1)]!;
      // 刀身寬度依武器：從刀尖往刀柄方向取 width 長度
      const dx = s.base[0] - s.tip[0];
      const dy = s.base[1] - s.tip[1];
      const dz = s.base[2] - s.tip[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      const w = Math.min(weapon.trail.width, len) / len;
      assets.positions.set([s.tip[0], s.tip[1], s.tip[2], s.tip[0] + dx * w, s.tip[1] + dy * w, s.tip[2] + dz * w], i * 6);
      const f = i < n ? Math.max(0, 1 - s.age / TRAIL_LIFE) : 0;
      assets.fade[i * 2] = f;
      assets.fade[i * 2 + 1] = f;
    }
    assets.geometry.attributes.position!.needsUpdate = true;
    assets.geometry.attributes.aFade!.needsUpdate = true;
    assets.geometry.computeBoundingSphere();
  });

  return <mesh ref={mesh} name="weapon-trail" geometry={assets.geometry} material={assets.material} frustumCulled={false} renderOrder={4} visible={false} />;
}

const IMPACT_POOL = 6;
const SPARKS_PER_IMPACT = 14;
const IMPACT_LIFE = 0.45;

function Impacts() {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const assets = useMemo(() => {
    const ringGeo = new THREE.RingGeometry(0.6, 1, 32);
    const ringMats = Array.from(
      { length: IMPACT_POOL },
      () =>
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(2.4, 2, 1.2),
          transparent: true,
          toneMapped: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
    );
    // 火花：每個衝擊固定 14 顆，方向在出現時決定
    const count = IMPACT_POOL * SPARKS_PER_IMPACT;
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const sparkMat = new THREE.PointsMaterial({
      size: 0.16,
      map: sparkTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const dirs = Array.from({ length: count }, (_, i) => {
      const a = (i * 2.399963) % (Math.PI * 2); // 黃金角，方向平均分布
      const up = ((i * 0.618) % 1) * 1.6 - 0.3;
      return new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    });
    return { ringGeo, ringMats, sparkGeo, sparkMat, dirs };
  }, []);
  useEffect(
    () => () => {
      assets.ringGeo.dispose();
      assets.ringMats.forEach((m) => m.dispose());
      assets.sparkGeo.dispose();
      assets.sparkMat.dispose();
    },
    [assets],
  );
  const sparksRef = useRef<THREE.Points>(null);
  const warm = useRef(3);

  useFrame(({ camera }) => {
    if (warm.current > 0) {
      // 前幾幀以全透明畫一次（同上，避免第一次命中時編譯 shader）
      warm.current--;
      rings.current.forEach((r) => r && (r.visible = true));
      assets.ringMats.forEach((m) => (m.opacity = 0));
      if (sparksRef.current) sparksRef.current.visible = true;
      return;
    }
    const list = combatRuntime.impacts.slice(-IMPACT_POOL);
    const pos = assets.sparkGeo.attributes.position as THREE.BufferAttribute;
    const col = assets.sparkGeo.attributes.color as THREE.BufferAttribute;
    for (let slot = 0; slot < IMPACT_POOL; slot++) {
      const ring = rings.current[slot];
      const impact = list[slot];
      const t = impact ? impact.age / IMPACT_LIFE : 1;
      const alive = impact !== undefined && t < 1;
      if (ring) {
        ring.visible = alive;
        if (alive) {
          const dust = impact.kind === 'dust';
          ring.position.set(impact.x, impact.y, impact.z);
          // 刀劍的光環面向攝影機；拳腳的衝擊塵環平貼地面往外擴散
          if (dust) ring.rotation.set(-Math.PI / 2, 0, 0);
          else ring.quaternion.copy(camera.quaternion);
          const ease = 1 - (1 - t) ** 3;
          ring.scale.setScalar((dust ? 0.4 + ease * 1.6 : 0.2 + ease * 0.9) * (0.8 + impact.power * 0.3));
          const mat = assets.ringMats[slot]!;
          mat.opacity = (1 - t) * (dust ? 0.7 : 1);
          if (dust) mat.color.setRGB(1.6, 1.5, 1.3);
          else mat.color.setRGB(2.6, 2.1, 1.1);
        }
      }
      for (let k = 0; k < SPARKS_PER_IMPACT; k++) {
        const i = slot * SPARKS_PER_IMPACT + k;
        if (!alive) {
          pos.setXYZ(i, 0, -1000, 0);
          continue;
        }
        const d = assets.dirs[i]!;
        const speed = (impact.kind === 'dust' ? 1.6 : 4.2) * (0.6 + ((k * 0.37) % 0.6));
        const dist = speed * impact.age;
        // 火花受重力往下掉
        pos.setXYZ(i, impact.x + d.x * dist, impact.y + d.y * dist - 4.5 * impact.age * impact.age, impact.z + d.z * dist);
        const fade = 1 - t;
        if (impact.kind === 'dust') col.setXYZ(i, 1.1 * fade, 1.0 * fade, 0.85 * fade);
        else col.setXYZ(i, 2.6 * fade, 1.9 * fade, 0.8 * fade);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    if (sparksRef.current) sparksRef.current.visible = list.length > 0;
  });

  return (
    <>
      {assets.ringMats.map((mat, i) => (
        <mesh key={i} ref={(m) => void (rings.current[i] = m)} geometry={assets.ringGeo} material={mat} visible={false} renderOrder={4} />
      ))}
      <points ref={sparksRef} geometry={assets.sparkGeo} material={assets.sparkMat} frustumCulled={false} renderOrder={4} visible={false} />
    </>
  );
}

export function MeleeEffects() {
  return (
    <>
      <WeaponTrail />
      <Impacts />
    </>
  );
}
