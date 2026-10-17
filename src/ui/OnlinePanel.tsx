import { useState, type ReactNode } from 'react';
import { cancelSignIn, signInWith, signOut, useAccountStore } from '@/account/accountStore';
import { DISPLAY_NAME_MAX, onlineAccess } from '@/game-core/online/rules';
import { t } from '@/game/i18n';
import { enterOnlineWorld } from '@/game/session';
import { loadOnlineAccount, saveDisplayName, useOnlineStore } from '@/online/onlineStore';
import { ClassPicker } from './ClassPicker';
import { formatPlayTime, formatSavedAt } from './saveFormat';

const primary = 'rounded-full bg-amber-400 py-2.5 text-lg font-bold text-amber-950 shadow hover:bg-amber-300 disabled:opacity-50';
const field = 'rounded-lg bg-white/10 px-3 py-2 outline-none focus:bg-white/20 focus:ring-2 focus:ring-amber-400 disabled:opacity-60';

/**
 * 主選單的「線上遊玩」（任務 11L-2，DECISIONS T-179）：線上一定要登入，資料只存在資料庫。
 * 依序：用 Google 或 LINE 登入（第一次登入就建立並綁定帳號，T-184）→ 第一次設定顯示名稱 → 進入線上世界。
 */
export function OnlinePanel() {
  const status = useAccountStore((s) => s.status);
  return (
    <div data-testid="online-panel" className="flex flex-col gap-3">
      {status === 'disabled' && (
        <p data-testid="online-disabled" className="rounded-xl bg-white/10 p-3 text-sm leading-6">
          {t('online.disabled')}
        </p>
      )}
      {status === 'signedOut' && <LoginStep />}
      {status === 'signingIn' && <WaitingStep />}
      {status === 'signedIn' && <SignedIn />}
    </div>
  );
}

function AccountError() {
  const error = useAccountStore((s) => s.error);
  if (!error) return null;
  return (
    <p data-testid="online-error" role="alert" className="rounded-lg bg-rose-500/30 p-2 text-xs">
      {error.startsWith('online.') ? t(error) : error}
    </p>
  );
}

/** 登入方式的按鈕：第一次登入就自動建立並綁定帳號（T-184） */
function LoginStep() {
  const busy = useAccountStore((s) => s.busy);
  const button = 'flex items-center justify-center gap-2 rounded-full py-2.5 text-base font-bold shadow disabled:opacity-50';
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6 opacity-85">{t('online.intro')}</p>
      <button type="button" data-testid="online-google" autoFocus disabled={busy} onClick={() => void signInWith('google')} className={`${button} bg-white text-slate-800 hover:bg-slate-100`}>
        <span aria-hidden className="text-lg font-black text-[#4285f4]">G</span>
        {t('account.withGoogle')}
      </button>
      <button type="button" data-testid="online-line" disabled={busy} onClick={() => void signInWith('line')} className={`${button} bg-[#06c755] text-white hover:bg-[#05b34c]`}>
        <span aria-hidden className="rounded bg-white px-1 text-xs font-black text-[#06c755]">LINE</span>
        {t('account.withLine')}
      </button>
      <AccountError />
    </div>
  );
}

/** 等待瀏覽器的登入頁面（桌面版在系統瀏覽器、網頁版正在導向） */
function WaitingStep() {
  const busy = useAccountStore((s) => s.busy);
  const provider = useAccountStore((s) => s.provider);
  return (
    <div className="flex flex-col gap-3">
      <p data-testid="online-waiting" role="status" className="rounded-xl bg-white/10 p-3 text-sm leading-6">
        {busy ? t('account.finishing') : t('account.waiting', { provider: provider === 'line' ? 'LINE' : 'Google' })}
      </p>
      {!busy && (
        <button type="button" data-testid="online-cancel" onClick={cancelSignIn} className="text-xs underline opacity-80">
          {t('account.cancel')}
        </button>
      )}
    </div>
  );
}

function SignedIn() {
  const email = useAccountStore((s) => s.email);
  const { profile, config, loading, error } = useOnlineStore();
  const who = profile?.displayName ?? email ?? '';

  let body: ReactNode;
  if (error === 'online.loadFailed') {
    body = (
      <div className="flex flex-col gap-2">
        <p role="alert" className="rounded-lg bg-rose-500/30 p-2 text-xs">{t('online.loadFailed')}</p>
        <button type="button" onClick={() => void loadOnlineAccount()} className="rounded-full bg-white/15 py-2 hover:bg-white/25">
          {t('online.retry')}
        </button>
      </div>
    );
  } else if (loading || !profile) {
    body = <p data-testid="online-loading" className="py-3 text-center text-sm opacity-80">{t('online.loading')}</p>;
  } else {
    const access = onlineAccess(profile, config, new Date());
    if (access.kind === 'banned') {
      body = (
        <p data-testid="online-banned" role="alert" className="rounded-xl bg-rose-500/30 p-3 text-sm leading-6">
          {t('online.banned')}
          {access.until && <span className="block">{t('online.bannedUntil', { time: new Date(access.until).toLocaleString('zh-TW') })}</span>}
          {access.reason && <span className="block">{t('online.banReason', { reason: access.reason })}</span>}
        </p>
      );
    } else if (access.kind === 'maintenance') {
      body = (
        <p data-testid="online-maintenance" role="status" className="rounded-xl bg-amber-500/25 p-3 text-sm leading-6">
          {t('online.maintenance')}
          {access.message && <span className="block">{access.message}</span>}
        </p>
      );
    } else if (access.kind === 'needsName') {
      body = <NameStep />;
    } else {
      body = <EnterStep />;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm">
        <span data-testid="online-signed-in" className="truncate">
          {t('online.signedInAs', { name: who })}
        </span>
        <button type="button" data-testid="online-signout" onClick={() => void signOut()} className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs hover:bg-white/25">
          {t('account.signOut')}
        </button>
      </div>
      {body}
    </div>
  );
}

function NameStep() {
  const { busy, error } = useOnlineStore();
  const [name, setName] = useState('');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void saveDisplayName(name);
      }}
    >
      <p className="text-sm font-bold">{t('online.nameTitle')}</p>
      <p className="text-xs leading-5 opacity-80">{t('online.nameHint', { max: String(DISPLAY_NAME_MAX) })}</p>
      <input
        data-testid="online-name"
        autoFocus
        maxLength={DISPLAY_NAME_MAX * 2}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        className={field}
      />
      <button type="submit" data-testid="online-name-save" disabled={busy || name.trim().length === 0} className={primary}>
        {t('online.nameSave')}
      </button>
      {error && error.startsWith('online.name.') && (
        <p data-testid="online-error" role="alert" className="rounded-lg bg-rose-500/30 p-2 text-xs">
          {t(error)}
        </p>
      )}
    </form>
  );
}

function EnterStep() {
  const { character, busy, error } = useOnlineStore();
  // 還沒有線上角色：先選職業（使用者 2026-10-17）
  const [picking, setPicking] = useState(false);
  if (picking) return <ClassPicker busy={busy} onStart={(heroClass) => void enterOnlineWorld(heroClass)} onBack={() => setPicking(false)} />;
  return (
    <div className="flex flex-col gap-3">
      <p data-testid="online-character" className="text-center text-xs opacity-80">
        {character
          ? t('online.character', { savedAt: formatSavedAt(character.savedAt), playTime: formatPlayTime(character.playTime) })
          : t('online.noCharacter')}
      </p>
      <button type="button" data-testid="online-enter" autoFocus disabled={busy} onClick={() => (character ? void enterOnlineWorld() : setPicking(true))} className={primary}>
        {busy ? t('online.entering') : t('online.enter')}
      </button>
      {error === 'online.enterFailed' && (
        <p data-testid="online-error" role="alert" className="rounded-lg bg-rose-500/30 p-2 text-xs">
          {t(error)}
        </p>
      )}
      <p className="text-center text-xs opacity-60">{t('online.separateNote')}</p>
    </div>
  );
}
