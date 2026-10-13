import { useEffect, useState } from 'react';
import { t } from '@/game/i18n';
import { keyVars } from '@/game/input/keyLabels';
import { useDebugStore } from '@/game/state/debugStore';
import { useGameStore } from '@/game/state/gameStore';
import { useBindings } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';

/** 遊玩中尚未鎖定滑鼠時提示操作方式；以事件驅動更新，不在每幀檢查。 */
export function ControlHint() {
  const mode = useDebugStore((s) => s.cameraMode);
  const playing = useGameStore((s) => s.screen === 'playing');
  const bindings = useBindings();
  // 對話、背包、訊息視窗開啟時不顯示，避免與視窗重疊
  const modal = useUiStore((s) => s.dialogue !== null || s.inventoryOpen || s.message !== null);
  const [locked, setLocked] = useState(() => document.pointerLockElement !== null);

  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  if (mode !== 'follow' || locked || !playing || modal) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
      <div className="rounded-full bg-black/45 px-5 py-2 text-sm text-white shadow">
        <span className="font-bold">{t('hint.clickToPlay')}</span>
        <span className="ml-3 opacity-85">{t('hint.controls', keyVars(bindings))}</span>
      </div>
    </div>
  );
}
