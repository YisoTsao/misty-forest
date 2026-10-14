import { useEffect, useRef, useState } from 'react';
import { exploredRatio } from '@/game-core/map/explore';
import { MAPS } from '@/game-core/world/maps';
import { TERRAIN_SIZE } from '@/game-core/world/terrain';
import { currentMap } from '@/game/location';
import { authority } from '@/game/authority';
import { t } from '@/game/i18n';
import { input } from '@/game/input/inputManager';
import { keyVars } from '@/game/input/keyLabels';
import { currentInterior } from '@/game/location';
import { cameraRuntime, playerRuntime } from '@/game/player/localRuntime';
import { currentScreen, useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useBindings } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';
import { getMapBase } from '@/render/mapImage';
import { fogFor } from './Minimap';
import {
  currentQuestMarkers,
  drawChests,
  drawLandmarks,
  drawLayer,
  drawNpcs,
  drawPlayer,
  drawQuestMarkers,
  drawRegionLabels,
  worldToScreen,
  type MapView,
} from './mapDraw';

/** 開啟或關閉世界地圖（M、暫停選單）。開啟時釋放滑鼠、角色停下（isModalOpen） */
export function setWorldMapOpen(open: boolean): void {
  const ui = useUiStore.getState();
  if (ui.mapOpen === open) return;
  ui.setMapOpen(open);
  if (open && document.pointerLockElement) document.exitPointerLock();
}

/**
 * 世界地圖（任務 7B，Bible §31.3）：整張晨曦谷地、未探索區域的霧罩、區域名稱、地標、任務標記、村民、寶箱與玩家位置。
 * M（可重新配置）開關、Esc 關閉；滾輪縮放、拖曳移動。室內也能開，顯示門口的位置。
 */
export function WorldMap() {
  const open = useUiStore((s) => s.mapOpen);
  const playing = useGameStore((s) => s.screen === 'playing');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const ui = useUiStore.getState();
      if (ui.mapOpen && (e.code === 'Escape' || input.isBound(e.code, 'map'))) {
        // 這個 Esc 只用來關地圖，不要再讓暫停選單收到
        e.stopImmediatePropagation();
        setWorldMapOpen(false);
        input.requestPointerLock();
        return;
      }
      if (!input.isBound(e.code, 'map') || currentScreen() !== 'playing' || ui.message || ui.dialogue || ui.inventoryOpen || ui.build) return;
      setWorldMapOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 回到主選單時關閉（暫停選單開的地圖在 paused 時保留）
  const title = useGameStore((s) => s.screen === 'title');
  useEffect(() => {
    if (title) useUiStore.getState().setMapOpen(false);
  }, [title]);

  if (!open || !worldDataResult.ok) return null;
  return <WorldMapWindow interactive={playing} />;
}

function WorldMapWindow({ interactive }: { interactive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const explored = useGameStateStore((s) => s.state.explored);
  const bindings = useBindings();
  // 視窗：預設顯示整張地圖、以地圖中心為中心；滾輪縮放、拖曳平移
  const [zoom, setZoom] = useState(1);
  // 世界地圖顯示所在的地圖（開啟期間不會換地圖：開啟時角色不能移動）
  const [map] = useState(() => currentMap());
  const origin = MAPS[map].origin;
  const [center, setCenter] = useState(() => ({ x: origin.x, z: origin.z }));
  const drag = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const [size, setSize] = useState(600);

  useEffect(() => {
    const fit = () => setSize(Math.floor(Math.min(window.innerWidth - 360, window.innerHeight - 120, 900)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!worldDataResult.ok) return;
    const data = worldDataResult.data;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const state = authority.getState();
      const view: MapView = { cx: center.x, cz: center.z, pxPerM: (size / TERRAIN_SIZE) * zoom, width: size, height: size };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#d6d6e2';
      ctx.fillRect(0, 0, size, size);
      drawLayer(ctx, getMapBase(data, map), view, map);
      drawLayer(ctx, fogFor(state.explored, map), view, map);
      drawRegionLabels(ctx, view, state.explored, map);
      drawLandmarks(ctx, view, state.explored, true, map);
      drawChests(ctx, view, state);
      drawNpcs(ctx, view, zoom >= 1.6);
      drawQuestMarkers(ctx, view, currentQuestMarkers(state));
      // 室內時畫在門口（開放世界座標）
      const inside = currentInterior();
      const p = inside ? null : playerRuntime.position;
      if (p) {
        const { sx, sy } = worldToScreen(view, p.x, p.z);
        drawPlayer(ctx, sx, sy, playerRuntime.locomotion.facingYaw, cameraRuntime.yaw);
      }
      const box = boxRef.current;
      if (box && p) {
        box.dataset.playerX = p.x.toFixed(1);
        box.dataset.playerZ = p.z.toFixed(1);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, zoom, center, map]);

  const close = () => {
    setWorldMapOpen(false);
    if (interactive) input.requestPointerLock();
  };
  const clampCenter = (x: number, z: number, z0 = zoom) => {
    const half = TERRAIN_SIZE / 2 - TERRAIN_SIZE / 2 / z0;
    return { x: Math.max(origin.x - half, Math.min(origin.x + half, x)), z: Math.max(origin.z - half, Math.min(origin.z + half, z)) };
  };
  const pct = Math.round(exploredRatio(explored, map) * 100);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45" onClick={close}>
      <div
        ref={boxRef}
        role="dialog"
        aria-labelledby="map-title"
        data-testid="world-map"
        data-explored={pct}
        data-pad-scope
        onClick={(e) => e.stopPropagation()}
        className="flex gap-4 rounded-2xl border-4 border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-2xl"
      >
        <canvas
          ref={canvasRef}
          data-testid="world-map-canvas"
          style={{ width: size, height: size }}
          className="cursor-grab rounded-xl border-2 border-amber-700/40 active:cursor-grabbing"
          onWheel={(e) => {
            const next = Math.min(4, Math.max(1, zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
            setZoom(next);
            setCenter((c) => clampCenter(c.x, c.z, next));
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, cx: center.x, cz: center.z };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const pxPerM = (size / TERRAIN_SIZE) * zoom;
            setCenter(clampCenter(d.cx - (e.clientX - d.x) / pxPerM, d.cz - (e.clientY - d.y) / pxPerM));
          }}
          onPointerUp={() => (drag.current = null)}
        />
        <aside className="flex w-56 flex-col gap-3">
          <h2 id="map-title" className="text-xl font-bold">
            {t('map.title')}
          </h2>
          <p className="-mt-2 text-sm font-bold text-amber-900" data-testid="world-map-name">
            {t(MAPS[map].nameKey)}
          </p>
          <p className="text-sm font-bold text-amber-800" data-testid="world-map-explored">
            {t('map.explored', { pct })}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-amber-200">
            <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
          </div>
          <div>
            <p className="mb-1 text-sm font-bold">{t('map.legend')}</p>
            <ul className="flex flex-col gap-1.5 text-sm">
              <Legend swatch={<span className="inline-block h-0 w-0 border-y-[6px] border-l-[12px] border-y-transparent border-l-orange-500" />} text={t('map.legend.player')} />
              <Legend swatch={<Dot color="#f2b630" text="!" />} text={t('map.legend.questAvailable')} />
              <Legend swatch={<Dot color="#4fb3e8" text="?" />} text={t('map.legend.questTurnIn')} />
              <Legend swatch={<Dot color="#f2b630" text="★" />} text={t('map.legend.questObjective')} />
              <Legend swatch={<span className="inline-block h-2.5 w-3.5 border border-amber-900 bg-amber-500" />} text={t('map.legend.chest')} />
              <Legend swatch={<span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-white bg-green-600" />} text={t('map.legend.npc')} />
            </ul>
          </div>
          <p className="mt-auto text-xs text-amber-800">{t('map.hint', keyVars(bindings))}</p>
          <button type="button" onClick={close} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-white hover:bg-amber-600">
            {t('map.close')}
          </button>
        </aside>
      </div>
    </div>
  );
}

function Legend({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex w-5 justify-center">{swatch}</span>
      {text}
    </li>
  );
}

function Dot({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-900 text-[10px] font-bold text-white" style={{ background: color }}>
      {text}
    </span>
  );
}
