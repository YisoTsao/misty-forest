import { useEffect, useRef } from 'react';
import { useTouchUi } from '@/game/input/device';
import { authority } from '@/game/authority';
import { debugEnabled } from '@/game/debugApi';
import { t } from '@/game/i18n';
import { currentInterior, currentMap } from '@/game/location';
import { cameraRuntime, playerRuntime } from '@/game/player/localRuntime';
import { currentScreen, useGameStore } from '@/game/state/gameStore';
import { useUiStore } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';
import { getMapBase } from '@/render/mapImage';
import { currentQuestMarkers, drawChests, drawEnemies, drawLandmarks, drawLayer, drawNpcs, drawPlayer, drawQuestMarkers, type MapView } from './mapDraw';

/** 小地圖的直徑（CSS 像素）與顯示範圍（半徑，公尺） */
const SIZE = 176;
const TOUCH_SIZE = 112;
const RANGE_M = 44;
const FRAME_MS = 1000 / 20;

/**
 * 小地圖（任務 7B）：畫面右上角的圓形地圖，北方朝上，顯示玩家附近 44 m。
 * 每秒畫 20 次，直接讀權威狀態與本機暫態，不經過 React 重新渲染。室內、對話、地圖開啟時隱藏。
 */
export function Minimap() {
  const playing = useGameStore((s) => s.screen === 'playing' || s.screen === 'paused');
  const hidden = useUiStore((s) => s.mapOpen || s.dialogue !== null);
  const region = useUiStore((s) => s.currentRegion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 手機版（任務 11M）：小地圖縮小，下方留給觸控的選單鈕
  const touch = useTouchUi();
  const size = touch ? TOUCH_SIZE : SIZE;

  useEffect(() => {
    if (!playing || hidden || !worldDataResult.ok) return;
    const data = worldDataResult.data;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      last = now;
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      // 室內子場景沒有地圖
      const indoors = currentInterior() !== null;
      wrap.style.visibility = indoors ? 'hidden' : 'visible';
      if (indoors || currentScreen() === 'title') return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const state = authority.getState();
      const p = playerRuntime.position;
      const view: MapView = { cx: p.x, cz: p.z, pxPerM: size / 2 / RANGE_M, width: size, height: size };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#d6d6e2';
      ctx.fillRect(0, 0, size, size);
      const map = currentMap();
      drawLayer(ctx, getMapBase(data, map), view, map);
      drawLandmarks(ctx, view, state, false, map);
      drawChests(ctx, view, state);
      drawNpcs(ctx, view, false);
      drawEnemies(ctx, view, RANGE_M * 1.2, p);
      ctx.restore();
      drawQuestMarkers(ctx, view, currentQuestMarkers(state), size / 2 - 12);
      drawPlayer(ctx, size / 2, size / 2, playerRuntime.locomotion.facingYaw, cameraRuntime.yaw);
      // 外框與北方標記
      ctx.strokeStyle = '#f3e4c0';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#c0392b';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeText(t('map.north'), size / 2, 11);
      ctx.fillText(t('map.north'), size / 2, 11);
      wrap.dataset.x = p.x.toFixed(1);
      wrap.dataset.z = p.z.toFixed(1);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playing, hidden, size]);

  if (!playing || hidden) return null;
  return (
    <div
      ref={wrapRef}
      data-testid="minimap"
      className={`pointer-events-none absolute flex flex-col items-center gap-1 ${touch ? 'top-3 right-3' : `top-4 ${debugEnabled ? 'right-48' : 'right-5'}`}`}
    >
      <canvas ref={canvasRef} style={{ width: size, height: size }} className="rounded-full shadow-lg" />
      <span data-testid="minimap-region" className="rounded-full bg-black/45 px-3 py-0.5 text-xs font-bold text-white shadow">
        {t(`region.${region}`)}
      </span>
    </div>
  );
}
