import { useEffect, useState } from 'react';
import { t } from '@/game/i18n';
import { useDebugStore } from '@/game/state/debugStore';
import { useGameStore } from '@/game/state/gameStore';

/** 遊玩中尚未鎖定滑鼠時提示操作方式；以事件驅動更新，不在每幀檢查。 */
export function ControlHint() {
  const mode = useDebugStore((s) => s.cameraMode);
  const playing = useGameStore((s) => s.screen === 'playing');
  const [locked, setLocked] = useState(() => document.pointerLockElement !== null);

  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  if (mode !== 'follow' || locked || !playing) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
      <div className="rounded-full bg-black/45 px-5 py-2 text-sm text-white shadow">
        <span className="font-bold">{t('hint.clickToPlay')}</span>
        <span className="ml-3 opacity-85">{t('hint.controls')}</span>
      </div>
    </div>
  );
}
