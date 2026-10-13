import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { SPAWN_POINT } from '@/game-core/world/terrain';

/** 繞場景緩慢旋轉的距離與高度：主選單背景同時看得到草原、小路與村莊 */
const CENTER = { x: SPAWN_POINT.x - 4, y: 3, z: SPAWN_POINT.z - 22 };
const RADIUS = 44;
const HEIGHT = 17;
const SPEED = 0.035; // 弧度 / 秒

/** 主選單背景攝影機：以實際遊戲場景當背景，緩慢環繞。 */
export function TitleCameraRig() {
  const angle = useRef(0.35);
  useFrame(({ camera }, dt) => {
    angle.current += Math.min(dt, 0.1) * SPEED;
    camera.position.set(CENTER.x + Math.sin(angle.current) * RADIUS, HEIGHT, CENTER.z + Math.cos(angle.current) * RADIUS);
    camera.lookAt(CENTER.x, CENTER.y, CENTER.z);
  });
  return null;
}
