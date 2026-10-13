// 效能量測數據（規格 7）。由 Canvas 內的 PerfProbe 每幀寫入，
// UI 面板以固定間隔讀取並直接更新 DOM，避免每幀觸發 React 重新渲染。
export const perfStats = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  /** 目前啟用的環境碰撞體數量（EnvironmentColliders 寫入） */
  activeColliders: 0,
};
