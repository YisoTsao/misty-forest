import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { footstepInterval, surfaceAt } from '@/game-core/audio/footsteps';
import { LAKE } from '@/game-core/world/terrain';
import { audio } from '@/game/audio/audioEngine';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { useSettingsStore } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';
import { mistRuntime } from '@/game/world/mistRuntime';

/**
 * 音效系統（規格 6.9）：腳步聲、環境音的混音、音樂開關。
 * 環境音依所在位置與畫面迷霧：晴朗時風聲輕、有鳥叫；迷霧越濃風越大、出現低沉嗡鳴、鳥叫消失；靠近湖邊有水聲。
 */
export function AudioSystem() {
  const steps = useMemo(() => ({ since: 0, wasGrounded: true }), []);
  const volumes = useSettingsStore((s) => s.volumes);
  useEffect(() => audio.setVolumes(volumes), [volumes]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const screen = currentScreen();
    audio.setMusicPlaying(screen !== 'paused');
    const mist = mistRuntime.value;
    const { position, locomotion } = playerRuntime;
    const lakeDist = Math.hypot(position.x - LAKE.x, position.z - LAKE.z) - LAKE.radius;
    const paused = screen === 'paused';
    audio.update(
      {
        wind: paused ? 0 : 0.35 + mist * 0.65,
        birds: paused || screen === 'title' ? 0 : Math.max(0, 1 - mist * 1.8),
        drone: paused ? 0 : Math.max(0, (mist - 0.3) / 0.7),
        water: paused ? 0 : Math.max(0, 1 - Math.max(0, lakeDist) / 14),
      },
      mist,
      dt,
    );

    // 腳步聲：遊玩中、站在地面上移動時；落地時踩一下
    if (screen !== 'playing' || useUiStore.getState().build?.menu) return;
    const feetY = position.y - 0.78;
    const surface = surfaceAt(position.x, position.z, feetY);
    if (locomotion.grounded && !steps.wasGrounded) audio.play(surface === 'wood' ? 'step_wood' : 'step_grass', 1.2);
    steps.wasGrounded = locomotion.grounded;
    const interval = locomotion.grounded ? footstepInterval(Math.hypot(locomotion.vx, locomotion.vz)) : null;
    if (interval === null) {
      steps.since = 0;
      return;
    }
    steps.since += dt;
    if (steps.since >= interval) {
      steps.since = 0;
      audio.play(surface === 'wood' ? 'step_wood' : 'step_grass');
    }
  });
  return null;
}
