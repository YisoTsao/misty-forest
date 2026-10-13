import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { listSaves, readSave, readSaveText, writeSave } from './saveFiles';

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
// 端對端測試使用獨立的使用者資料夾（IndexedDB、快取等），不碰玩家的真實資料
if (process.env.MISTWOOD_USER_DATA_DIR) app.setPath('userData', process.env.MISTWOOD_USER_DATA_DIR);
// 截圖腳本或除錯時可帶入初始查詢參數（例如 cam=meadow&mist=0）
const startQuery = process.env.MISTWOOD_START_QUERY ?? '';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#bfe3f5',
    title: '迷霧之森：星光旅人',
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // 禁止開新視窗與導向外部頁面；外部連結交給系統瀏覽器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (devServerUrl && url.startsWith(devServerUrl)) return;
    event.preventDefault();
  });

  if (devServerUrl) {
    void win.loadURL(startQuery ? `${devServerUrl}?${startQuery}` : devServerUrl);
  } else {
    void win.loadFile(path.join(import.meta.dirname, '../dist/index.html'), {
      search: startQuery || undefined,
    });
  }
}

/**
 * 存檔資料夾：userData/saves（規格 6.8）。
 * MISTWOOD_SAVE_DIR 讓端對端測試使用獨立的暫存資料夾，不碰玩家的真實存檔。
 */
function saveDir(): string {
  return process.env.MISTWOOD_SAVE_DIR ?? path.join(app.getPath('userData'), 'saves');
}

function registerSaveIpc(): void {
  ipcMain.handle('save:list', () => listSaves(saveDir()));
  ipcMain.handle('save:read', (_e, slot: unknown, source: unknown) => readSave(saveDir(), slot, source));
  ipcMain.handle('save:write', (_e, slot: unknown, data: unknown) => writeSave(saveDir(), slot, data));
  ipcMain.handle('save:readText', (_e, slot: unknown) => readSaveText(saveDir(), slot));
}

app.whenReady().then(() => {
  registerSaveIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 遊戲只有一個視窗：關閉（含主選單「離開遊戲」）即結束程式，macOS 也一樣
app.on('window-all-closed', () => app.quit());
