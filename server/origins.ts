// 連線來源允許清單（任務 11D）：部署時以環境變數 ALLOWED_ORIGINS 設定（逗號分隔），支援 * 萬用字元，
// 例如 `https://mistwood.vercel.app,https://mistwood-*.vercel.app,null,file://`（null / file:// 是 Electron 正式版）。
// 沒設定時全部允許（本機開發、e2e）。沒有帶 Origin 的請求（非瀏覽器：健康檢查、測試、Node 客戶端）一律允許——
// 來源檢查只防止別的網站在瀏覽器裡連過來，不是身分驗證（Phase 5 改用 Supabase 的 JWT）。

export type OriginRule = { raw: string; test: (origin: string) => boolean };

export function parseAllowedOrigins(env: string | undefined): OriginRule[] {
  return (env ?? '')
    .split(',')
    .map((s) => normalize(s.trim()))
    .filter(Boolean)
    .map((raw) => {
      if (!raw.includes('*')) return { raw, test: (origin: string) => origin === raw };
      const pattern = new RegExp(`^${raw.split('*').map(escapeRegExp).join('[a-z0-9-]*')}$`, 'i');
      return { raw, test: (origin: string) => pattern.test(origin) };
    });
}

export function isAllowedOrigin(origin: string | null | undefined, rules: readonly OriginRule[]): boolean {
  if (rules.length === 0) return true;
  if (origin === undefined || origin === null || origin === '') return true;
  const normalized = normalize(origin);
  return rules.some((r) => r.test(normalized));
}

/** 去掉結尾的斜線（https://a.app/ → https://a.app），但保留只有協定的來源（file://） */
function normalize(origin: string): string {
  return origin.endsWith('://') ? origin : origin.replace(/\/+$/, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
