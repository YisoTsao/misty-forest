import { FADE_MS, useLocationStore } from '@/game/location';

/** 進出建築時的黑幕 */
export function LocationFade() {
  const fade = useLocationStore((s) => s.fade);
  return (
    <div
      data-testid="location-fade"
      className="pointer-events-none absolute inset-0 bg-black"
      style={{ opacity: fade === 'out' ? 1 : 0, transition: `opacity ${FADE_MS}ms ease-in-out` }}
    />
  );
}
