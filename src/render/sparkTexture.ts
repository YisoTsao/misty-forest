import * as THREE from 'three';

let shared: THREE.CanvasTexture | null = null;

/** 柔和的圓形光點貼圖（星點、拖尾用），以 canvas 產生、全專案共用一張 */
export function sparkTexture(): THREE.CanvasTexture {
  if (shared) return shared;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('無法建立 canvas 2D context');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  shared = new THREE.CanvasTexture(c);
  return shared;
}
