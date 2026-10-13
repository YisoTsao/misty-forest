import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 遊戲只有一個視窗：關閉（含主選單「離開遊戲」）即結束程式，macOS 也一樣
app.on('window-all-closed', () => app.quit());
