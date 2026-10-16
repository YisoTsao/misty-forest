import { useEffect, useState } from 'react';
import { backToEmail, sendCode, signOut, useAccountStore, verifyCode } from '@/account/accountStore';
import { reconcileSave, resolveConflict } from '@/account/sync';
import { t } from '@/game/i18n';
import { useGameStore } from '@/game/state/gameStore';
import { useUiStore } from '@/game/state/uiStore';

/** 驗證碼位數：Supabase 後台的 Email OTP Length 可能是 6 或 8，兩種都接受，實際正確與否由 Supabase 判斷 */
const CODE_MIN = 6;
const CODE_MAX = 8;

/**
 * 帳號面板（任務 11G）：Email 驗證碼登入、登出。登入只在標題畫面進行。
 * 登入後標題畫面會比對本機與雲端存檔；兩邊不同版時在這裡請玩家選一份（不會自動覆蓋）。
 */
export function AccountPanel() {
  const open = useUiStore((s) => s.accountOpen);
  const conflict = useAccountStore((s) => s.conflict);
  const status = useAccountStore((s) => s.status);
  const screen = useGameStore((s) => s.screen);

  // 標題畫面登入後比對一次存檔（只做一次，見 accountStore.synced）
  useEffect(() => {
    if (status === 'signedIn' && screen === 'title' && !useAccountStore.getState().synced) void reconcileSave();
  }, [status, screen]);

  if (conflict) return <ConflictDialog />;
  if (!open) return null;
  return <AccountWindow />;
}

function AccountWindow() {
  const { status, email, pendingEmail, busy, error } = useAccountStore();
  const onTitle = useGameStore((s) => s.screen) === 'title';
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const close = () => useUiStore.getState().setAccountOpen(false);

  useEffect(() => {
    // capture 階段：面板開著時按鍵不傳給遊戲與暫停選單（輸入框照常打字）
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.code === 'Escape' && !busy) close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy]);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
      <div role="dialog" aria-labelledby="account-title" data-testid="account-panel" data-pad-scope className="flex w-[min(94vw,24rem)] flex-col gap-3 rounded-2xl bg-slate-900 p-6 text-sm text-white shadow-2xl">
        <h2 id="account-title" className="text-center text-2xl font-bold">
          {t('account.title')}
        </h2>
        {status === 'disabled' && <p data-testid="account-disabled" className="text-xs opacity-80">{t('account.disabled')}</p>}

        {status === 'signedOut' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (onTitle) await sendCode(address);
            }}
          >
            <p className="text-xs opacity-70">{t('account.intro')}</p>
            <label className="flex flex-col gap-1">
              <span className="opacity-80">{t('account.email')}</span>
              <input data-testid="account-email" type="email" autoComplete="email" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!onTitle || busy} className="rounded-lg bg-white/10 px-3 py-2 outline-none focus:bg-white/20" />
            </label>
            {!onTitle && <p data-testid="account-title-only" className="text-xs text-amber-200">{t('account.signInFromTitle')}</p>}
            <button type="submit" data-testid="account-send" disabled={!onTitle || busy || !address.includes('@')} className="rounded-full bg-amber-400 py-2 font-bold text-amber-950 disabled:opacity-40">
              {t('account.sendCode')}
            </button>
          </form>
        )}

        {status === 'codeSent' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await verifyCode(code);
            }}
          >
            <p data-testid="account-code-sent" className="text-xs opacity-80">{t('account.codeSent', { email: pendingEmail ?? '' })}</p>
            <label className="flex flex-col gap-1">
              <span className="opacity-80">{t('account.code')}</span>
              <input data-testid="account-code" inputMode="numeric" autoComplete="one-time-code" maxLength={CODE_MAX} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_MAX))} disabled={busy} className="rounded-lg bg-white/10 px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:bg-white/20" />
            </label>
            <button type="submit" data-testid="account-verify" disabled={busy || code.length < CODE_MIN} className="rounded-full bg-amber-400 py-2 font-bold text-amber-950 disabled:opacity-40">
              {t('account.verify')}
            </button>
            <button type="button" onClick={backToEmail} disabled={busy} className="text-xs underline opacity-80">
              {t('account.changeEmail')}
            </button>
          </form>
        )}

        {status === 'signedIn' && (
          <div className="flex flex-col gap-3">
            <p data-testid="account-email-shown" className="text-center">{t('account.signedInAs', { email: email ?? '' })}</p>
            <p className="text-xs opacity-70">{onTitle ? t('account.syncNote') : t('account.signInFromTitle')}</p>
            <button type="button" data-testid="account-signout" disabled={busy} onClick={() => void signOut()} className="rounded-full bg-white/15 py-2 hover:bg-white/25">
              {t('account.signOut')}
            </button>
          </div>
        )}

        {error && <p data-testid="account-error" role="alert" className="rounded bg-rose-500/30 p-2 text-xs">{error.startsWith('account.') ? t(error) : error}</p>}
        <button type="button" data-testid="account-close" onClick={close} className="rounded-full bg-white/10 py-2 hover:bg-white/20">
          {t('net.close')}
        </button>
      </div>
    </div>
  );
}

/** 本機與雲端的存檔不同版：請玩家選一份保留（不自動覆蓋任何一邊） */
function ConflictDialog() {
  const conflict = useAccountStore((s) => s.conflict)!;
  const [busy, setBusy] = useState(false);
  const pick = async (choice: 'cloud' | 'local') => {
    setBusy(true);
    await resolveConflict(choice);
    setBusy(false);
  };
  const line = (side: { savedAt: string; playTime: number }) =>
    `${new Date(side.savedAt).toLocaleString()} · ${t('account.playTime', { hours: (side.playTime / 3600).toFixed(1) })}`;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
      <div role="alertdialog" aria-labelledby="conflict-title" data-testid="save-conflict" className="flex w-[min(94vw,26rem)] flex-col gap-3 rounded-2xl bg-slate-900 p-6 text-sm text-white shadow-2xl">
        <h2 id="conflict-title" className="text-center text-xl font-bold">{t('account.conflictTitle')}</h2>
        <p className="text-xs opacity-80">{t('account.conflictBody')}</p>
        <button type="button" data-testid="conflict-cloud" disabled={busy} onClick={() => void pick('cloud')} className="flex flex-col rounded-xl bg-amber-400 px-4 py-2 text-left text-amber-950 disabled:opacity-50">
          <span className="font-bold">{t('account.useCloud')}</span>
          <span className="text-xs">{line(conflict.cloud)}</span>
        </button>
        <button type="button" data-testid="conflict-local" disabled={busy} onClick={() => void pick('local')} className="flex flex-col rounded-xl bg-white/15 px-4 py-2 text-left hover:bg-white/25 disabled:opacity-50">
          <span className="font-bold">{t('account.useLocal')}</span>
          <span className="text-xs">{line(conflict.local)}</span>
        </button>
      </div>
    </div>
  );
}
