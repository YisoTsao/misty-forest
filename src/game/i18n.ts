import zhTW from '@/data/i18n/zh-TW.json';

export type I18nKey = keyof typeof zhTW;

const dictionary: Record<string, string> = zhTW;

/** 取得 UI 文字。缺 key 時回傳 key 本身並在開發模式警告，方便發現遺漏。 */
export function t(key: I18nKey | (string & {})): string {
  const value = dictionary[key];
  if (value === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] 缺少文字 key：${key}`);
    return key;
  }
  return value;
}
