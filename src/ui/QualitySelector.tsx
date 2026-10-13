import { qualityLevels } from '@/game-core/settings/quality';
import { t } from '@/game/i18n';
import { useSettingsStore } from '@/game/state/settingsStore';

/** 畫質三級切換（規格 4.4）：除錯面板與暫停選單共用。 */
export function QualitySelector({ className = '' }: { className?: string }) {
  const quality = useSettingsStore((s) => s.quality);
  const setQuality = useSettingsStore((s) => s.setQuality);
  return (
    <div role="radiogroup" aria-label={t('settings.quality')} className={`flex gap-1 ${className}`}>
      {qualityLevels.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={quality === level}
          data-testid={`quality-${level}`}
          onClick={() => setQuality(level)}
          className={`flex-1 rounded px-2 py-1 hover:bg-white/20 ${quality === level ? 'bg-white/25' : ''}`}
        >
          {t(`quality.${level}`)}
        </button>
      ))}
    </div>
  );
}
