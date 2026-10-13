import { t } from '@/game/i18n';

/** 致命錯誤畫面：資料無法載入時顯示，不留白畫面。 */
export function FatalScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 bg-sky-100 p-8 text-slate-800">
      <h1 className="text-2xl font-bold">{title}</h1>
      <pre className="max-w-3xl overflow-auto rounded bg-white/70 p-4 text-sm whitespace-pre-wrap">{detail}</pre>
      <button type="button" className="rounded-full bg-emerald-600 px-5 py-2 text-white" onClick={() => window.location.reload()}>
        {t('error.reload')}
      </button>
    </div>
  );
}
