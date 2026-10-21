import { isTouchPreferred, useInputDeviceStore } from './device';

// 手機瀏覽器的整頁行為（使用者 2026-10-21：連點兩下畫面會放大、按遊玩要全螢幕）。
// iOS Safari 從 iOS 10 起忽略 viewport 的 user-scalable=no，touch-action 也擋不住所有雙擊縮放，
// 所以在這裡直接攔下雙擊與雙指縮放整頁的手勢（遊戲的雙指縮放鏡頭用 pointer 事件，不受影響）。

/** 兩次點擊間隔小於這個值、距離小於 DOUBLE_TAP_PX 算雙擊（瀏覽器的雙擊縮放也是這樣判斷；快速點兩個不同的按鈕不受影響） */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 40;

/**
 * 不攔截的目標：輸入框保留瀏覽器的預設行為（雙擊選字、游標）；按鈕與連結已由 styles.css 的 touch-action: manipulation
 * 關掉雙擊縮放，不攔截才不會吞掉快速連點（例如對話框連點「繼續」）的第二下。
 */
function keepDefault(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest('input, textarea, select, button, a, summary, [role="button"]') !== null;
}

/** 安裝一次：擋下整頁縮放，並依目前是否用觸控介面在 <html> 加上 `touch-ui`（styles.css 依此縮小整體字級） */
export function installMobileGuards(): void {
  if (typeof window === 'undefined') return;
  let last = { time: -Infinity, x: 0, y: 0 };
  document.addEventListener(
    'touchend',
    (e) => {
      const touch = e.changedTouches[0];
      if (!touch || e.touches.length > 0) return;
      const now = e.timeStamp;
      const near = Math.hypot(touch.clientX - last.x, touch.clientY - last.y) < DOUBLE_TAP_PX;
      if (now - last.time < DOUBLE_TAP_MS && near && !keepDefault(e.target)) {
        e.preventDefault();
        // 第三下不再算雙擊
        last = { time: -Infinity, x: 0, y: 0 };
        return;
      }
      last = { time: now, x: touch.clientX, y: touch.clientY };
    },
    { passive: false },
  );
  // 桌機的觸控板或其他瀏覽器補送的 dblclick
  document.addEventListener('dblclick', (e) => {
    if (!keepDefault(e.target)) e.preventDefault();
  });
  // iOS Safari 的雙指縮放整頁（gesture 事件只有 WebKit 有）
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

  const syncClass = () => document.documentElement.classList.toggle('touch-ui', useInputDeviceStore.getState().device === 'touch');
  syncClass();
  useInputDeviceStore.subscribe(syncClass);
}

/**
 * 開始遊玩時進入全螢幕（只在觸控裝置）。必須在點擊的同一個事件裡呼叫（瀏覽器規定要使用者手勢）。
 * iPhone 的瀏覽器不支援網頁全螢幕（只有影片可以），這時什麼都不做；改用「加入主畫面」開啟就沒有網址列（manifest 的 display: fullscreen）。
 */
export function enterFullscreenOnTouch(): void {
  if (typeof document === 'undefined' || !isTouchPreferred() || document.fullscreenElement) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (typeof el.requestFullscreen === 'function') void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  } catch {
    // 不支援或被拒絕：照常以一般畫面遊玩
  }
}
