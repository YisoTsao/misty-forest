import { app, BrowserWindow, ipcMain, powerSaveBlocker, shell } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { listSaves, readSave, readSaveText, writeSave } from './saveFiles';

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
// 端對端測試使用獨立的使用者資料夾（IndexedDB、快取等），不碰玩家的真實資料
if (process.env.MISTWOOD_USER_DATA_DIR) app.setPath('userData', process.env.MISTWOOD_USER_DATA_DIR);
// 截圖腳本或除錯時可帶入初始查詢參數（例如 cam=meadow&mist=0）
const startQuery = process.env.MISTWOOD_START_QUERY ?? '';
/**
 * 背景執行（自動測試、截圖）：視窗出現但不搶焦點、不跳到最前面，也不在 Dock 顯示圖示；
 * 視窗被遮住或不在前景時照常渲染與計時，測試不會因此停住。
 */
const background = process.env.MISTWOOD_BACKGROUND === '1';
if (background) {
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  if (process.platform === 'darwin') app.setActivationPolicy('accessory');
}

/**
 * macOS：目前螢幕上最前面的視窗正下方那個視窗（CGWindowID）。背景執行時把遊戲視窗插到它上面，
 * 也就是使用者正在用的視窗後面：看得到遊戲視窗，但不會蓋住使用者的畫面。讀取視窗編號不需要額外權限。
 */
function secondWindowId(): Promise<number | null> {
  const script = `ObjC.import('CoreGraphics');
const list = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, 0));
const ids = [];
for (let i = 0; i < list.count; i++) {
  const w = list.objectAtIndex(i);
  if (w.objectForKey('kCGWindowLayer').js === 0 && w.objectForKey('kCGWindowOwnerPID').js !== ${process.pid}) ids.push(w.objectForKey('kCGWindowNumber').js);
}
ids.length > 1 ? String(ids[1]) : '';`;
  return new Promise((resolve) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 3000 }, (err, stdout) => {
      const id = Number(stdout.trim());
      resolve(err || !id ? null : id);
    });
  });
}

/** 顯示視窗但不搶焦點，並放到使用者目前視窗的後面 */
async function showInBackground(win: BrowserWindow): Promise<void> {
  const below = process.platform === 'darwin' ? await secondWindowId() : null;
  win.showInactive();
  if (below !== null) {
    try {
      win.moveAbove(`window:${below}:0`);
    } catch (err) {
      console.warn('無法調整視窗順序', err);
    }
  }
}

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
      backgroundThrottling: !background,
    },
  });

  win.once('ready-to-show', () => (background ? void showInBackground(win) : win.show()));

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
  // 背景執行時避免 macOS App Nap 降低計時精度
  if (background) powerSaveBlocker.start('prevent-app-suspension');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 遊戲只有一個視窗：關閉（含主選單「離開遊戲」）即結束程式，macOS 也一樣
app.on('window-all-closed', () => app.quit());
