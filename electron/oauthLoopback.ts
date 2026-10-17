// 桌面版的 OAuth 登入（DECISIONS T-184）：Electron 的頁面是 file://，Google / LINE 無法導回來，
// 改由系統瀏覽器登入，登入完成後導回本機的 127.0.0.1 迴路位址，主程序收下網址參數交給頁面換成登入狀態。
// 只聽 127.0.0.1、一次只等一個登入、逾時自動關閉；收到的參數只有 code / error，不含任何憑證。
import { createServer, type Server } from 'node:http';

/** 固定埠號：Supabase 的 Redirect URLs 要列出 http://127.0.0.1:53682/** */
export const LOOPBACK_PORT = 53682;
export const LOOPBACK_PATH = '/auth/callback';
export const LOOPBACK_REDIRECT = `http://127.0.0.1:${LOOPBACK_PORT}${LOOPBACK_PATH}`;
/** 等待登入完成的上限（毫秒） */
const TIMEOUT_MS = 5 * 60_000;

export type OAuthCallback = { code?: string; error?: string };

/** 從回呼網址取出 code 或錯誤說明；不是回呼路徑時回傳 null */
export function parseCallback(url: string): OAuthCallback | null {
  const parsed = new URL(url, `http://127.0.0.1:${LOOPBACK_PORT}`);
  if (parsed.pathname !== LOOPBACK_PATH) return null;
  const code = parsed.searchParams.get('code');
  const error = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  if (code) return { code };
  return { error: error ?? 'missing code' };
}

/** 只允許打開 Supabase 的登入網址（https，主機名稱與設定的 Supabase 相同） */
export function isAllowedAuthUrl(url: string, supabaseHost: string | null): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (supabaseHost === null || parsed.host === supabaseHost) && parsed.pathname.startsWith('/auth/v1/authorize');
  } catch {
    return false;
  }
}

const DONE_PAGE = `<!doctype html><meta charset="utf-8"><title>迷霧之森</title>
<body style="font-family:sans-serif;background:#1d2a3a;color:#fff;display:grid;place-items:center;height:100vh;margin:0">
<p>登入完成，可以關閉這個分頁回到遊戲。</p></body>`;

let pending: { server: Server; finish: (result: OAuthCallback) => void } | null = null;
/** 上一次的伺服器關閉完成（重新登入前先等埠號釋放） */
let closing: Promise<void> = Promise.resolve();

/** 開始等待回呼：回傳的 Promise 在收到回呼、取消或逾時時完成。重複呼叫會取消上一次。 */
export function waitForCallback(): Promise<OAuthCallback> {
  cancelCallback();
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const result = parseCallback(req.url ?? '/');
      if (!result) {
        res.writeHead(404).end();
        return;
      }
      // 完成頁面送出後才關閉伺服器
      res.on('finish', () => finish(result));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' }).end(DONE_PAGE);
    });
    const timer = setTimeout(() => finish({ error: 'timeout' }), TIMEOUT_MS);
    let done = false;
    function finish(result: OAuthCallback): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (pending?.server === server) pending = null;
      closing = new Promise((closed) => server.close(() => closed()));
      // 瀏覽器的 keep-alive 連線會讓 close 一直等下去
      server.closeAllConnections();
      resolve(result);
    }
    server.on('error', (err) => finish({ error: err.message }));
    pending = { server, finish };
    void closing.then(() => {
      if (pending?.server === server) server.listen(LOOPBACK_PORT, '127.0.0.1');
    });
  });
}

/** 取消正在等待的登入（玩家按了取消，或重新開始登入） */
export function cancelCallback(): void {
  pending?.finish({ error: 'cancelled' });
}
