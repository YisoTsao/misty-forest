import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode, type HueSaturationEffect } from 'postprocessing';
import { useRef } from 'react';
import { useQualityPreset } from '@/game/state/settingsStore';
import { uMist } from './mist';

/** 晴朗時略提高飽和（明亮卡通感），迷霧時再壓低（規格 4.5：後處理飽和度跟隨 uMist） */
const SATURATION_CLEAR = 0.1;
const SATURATION_MIST = -0.2;

/**
 * 輕度後處理（規格 4.4）：Bloom（只讓高光微微發亮）、飽和度調色、暗角、tone mapping。
 * 低畫質關閉，直接由 renderer 輸出（renderer 本身已設定 NeutralToneMapping）。
 */
export function PostEffects() {
  const preset = useQualityPreset();
  const saturation = useRef<HueSaturationEffect>(null);

  useFrame(() => {
    const effect = saturation.current;
    if (!effect) return;
    effect.saturation = SATURATION_CLEAR + (SATURATION_MIST - SATURATION_CLEAR) * uMist.value;
  });

  if (!preset.postprocessing) return null;
  return (
    // multisampling：後處理會繞過 canvas 的原生抗鋸齒，改由 composer 的 MSAA 處理
    <EffectComposer multisampling={4}>
      <Bloom intensity={0.35} luminanceThreshold={0.82} luminanceSmoothing={0.2} mipmapBlur />
      <HueSaturation ref={saturation} saturation={SATURATION_CLEAR} />
      <Vignette offset={0.32} darkness={0.42} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
