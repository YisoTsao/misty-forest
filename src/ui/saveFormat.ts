import { t } from '@/game/i18n';

/** 遊玩時間（秒）→「1 小時 5 分」／「12 分」 */
export function formatPlayTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${hours} ${t('time.hours')} ${minutes % 60} ${t('time.minutes')}`
    : `${Math.max(minutes, 0)} ${t('time.minutes')}`;
}

/** ISO 時間 →「2026/10/13 10:45」（本地時區） */
export function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
