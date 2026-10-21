import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installDebugApi } from '@/game/debugApi';
import { installAudioUnlock } from '@/game/audio/audioEngine';
import { installAudioFeedback } from '@/game/audio/audioFeedback';
import { installCombatRuntime } from '@/game/combat/combatRuntime';
import { installBossRuntime } from '@/game/combat/bossRuntime';
import { installLighthouseRuntime } from '@/game/world/lighthouseRuntime';
import { installSpellEffects } from '@/game/combat/spellRuntime';
import { installCompanion } from '@/game/companion/companionRuntime';
import { installEventFeedback } from '@/game/eventFeedback';
import { loadMainSave } from '@/game/save/saveService';
import { installAutosave } from '@/game/session';
import { installMobileGuards } from '@/game/input/mobileGuards';
import { installNetwork } from '@/net/installNetwork';
import { syncClockFromServer } from '@/net/serverTime';
import { installOnline } from '@/online/installOnline';
import { loadSettings } from '@/game/state/settingsStore';
import { t } from '@/game/i18n';
import { useErrorStore } from '@/game/state/errorStore';
import { App } from './App';
import './styles.css';

document.title = t('app.title');
installDebugApi();
// 手機：擋下雙擊與雙指縮放整頁、觸控介面縮小字級
installMobileGuards();
installEventFeedback();
installCombatRuntime();
installBossRuntime();
installLighthouseRuntime();
installSpellEffects();
installCompanion();
installAudioUnlock();
installAudioFeedback();
installAutosave();
installNetwork();
// 共享日光（T-181）：單機也向遊戲伺服器對時
void syncClockFromServer();
// 帳號與線上模式（任務 11L-2）：還原登入、讀取遊戲設定（維護模式）
installOnline();
// 啟動時檢查存檔（主選單顯示「繼續遊戲」或損壞提示）；讀取失敗不影響啟動
void loadMainSave();
void loadSettings();

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
