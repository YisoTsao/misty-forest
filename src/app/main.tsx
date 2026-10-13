import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installDebugApi } from '@/game/debugApi';
import { t } from '@/game/i18n';
import { useErrorStore } from '@/game/state/errorStore';
import { App } from './App';
import './styles.css';

document.title = t('app.title');
installDebugApi();

// 未捕捉的錯誤（例如 useFrame 內拋出，會讓整個渲染迴圈停住）顯示在畫面上，不讓遊戲無聲凍結
const reportRuntimeError = (detail: unknown) =>
  useErrorStore.getState().reportError(`${t('error.runtime')}：${detail instanceof Error ? detail.message : String(detail)}`);
window.addEventListener('error', (e) => reportRuntimeError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => reportRuntimeError(e.reason));

const root = document.getElementById('root');
if (!root) throw new Error('找不到 #root 節點');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
