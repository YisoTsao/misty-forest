import { useEffect, useMemo, useState } from 'react';
import { codexCategories, codexProgress, type CodexCategory, type CodexEntry } from '@/game-core/codex/codex';
import { codex } from '@/game/authority';
import { codexName } from '@/game/codexNames';
import { t } from '@/game/i18n';
import { useTouchUi } from '@/game/input/device';
import { input } from '@/game/input/inputManager';
import { keyVars } from '@/game/input/keyLabels';
import { currentScreen, useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useBindings } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';
import { ItemIcon } from './ItemIcon';

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();

/** 開啟或關閉圖鑑（K、暫停選單）。開啟時釋放滑鼠、角色停下（isModalOpen） */
export function setCodexOpen(open: boolean): void {
  const ui = useUiStore.getState();
  if (ui.codexOpen === open) return;
  ui.setCodexOpen(open);
  if (open && document.pointerLockElement) document.exitPointerLock();
}

/**
 * 圖鑑（第二章規格 §11.3、Bible §30.1）：生物 / 素材 / 記錄三個分頁與完成度。
 * 已解鎖的條目顯示介紹（生物另有棲息地、行為與弱點；素材另有取得方式）；還沒解鎖的顯示「？？？」與解鎖方式。
 */
export function CodexPanel() {
  const open = useUiStore((s) => s.codexOpen);
  const playing = useGameStore((s) => s.screen === 'playing');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const ui = useUiStore.getState();
      if (ui.codexOpen && (e.code === 'Escape' || input.isBound(e.code, 'codex'))) {
        // 這個 Esc 只用來關圖鑑，不要再讓暫停選單收到
        e.stopImmediatePropagation();
        setCodexOpen(false);
        input.requestPointerLock();
        return;
      }
      if (!input.isBound(e.code, 'codex') || currentScreen() !== 'playing' || ui.message || ui.dialogue || ui.inventoryOpen || ui.mapOpen || ui.journalOpen || ui.build) return;
      setCodexOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const title = useGameStore((s) => s.screen === 'title');
  useEffect(() => {
    if (title) useUiStore.getState().setCodexOpen(false);
  }, [title]);

  if (!open) return null;
  return <CodexWindow interactive={playing} />;
}

function CodexWindow({ interactive }: { interactive: boolean }) {
  const unlocked = useGameStateStore((s) => s.state.codex);
  const bindings = useBindings();
  const touch = useTouchUi();
  const [tab, setTab] = useState<CodexCategory>('creature');
  const list = useMemo(() => codex.filter((e) => e.category === tab), [tab]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = list.find((e) => e.id === selected) ?? list.find((e) => unlocked.includes(e.id)) ?? list[0] ?? null;
  const total = codexProgress(codex, unlocked);

  const close = () => {
    setCodexOpen(false);
    if (interactive) input.requestPointerLock();
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45" onClick={close}>
      <div
        role="dialog"
        aria-labelledby="codex-title"
        data-testid="codex"
        data-pad-scope
        onClick={(e) => e.stopPropagation()}
        className={`ui-panel flex flex-col rounded-2xl border-4 border-emerald-200 bg-emerald-50 text-emerald-950 shadow-2xl ${
          touch ? 'h-[min(88dvh,560px)] w-[min(94vw,560px)] gap-2 p-3' : 'h-[min(620px,85vh)] w-[min(880px,92vw)] gap-3 p-4'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <h2 id="codex-title" className={`font-bold ${touch ? 'text-base' : 'text-xl'}`}>
              {t('codex.title')}
            </h2>
            <span data-testid="codex-progress" className="text-xs font-bold text-emerald-700">
              {t('codex.progress', { unlocked: total.unlocked, total: total.total })}
            </span>
          </div>
          {touch ? (
            <button
              type="button"
              data-testid="codex-close"
              aria-label={t('inventory.close')}
              onClick={close}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-lg font-bold text-white hover:bg-emerald-600"
            >
              ✕
            </button>
          ) : (
            <p className="text-xs text-emerald-800">{t('codex.hint', keyVars(bindings))}</p>
          )}
        </div>
        <div className={`flex gap-2 ${touch ? 'overflow-x-auto' : ''}`} role="tablist">
          {codexCategories.map((id) => {
            const p = codexProgress(codex, unlocked, id);
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-testid={`codex-tab-${id}`}
                onClick={() => {
                  setTab(id);
                  setSelected(null);
                }}
                className={`shrink-0 rounded-full font-bold ${touch ? 'px-3 py-0.5 text-xs' : 'px-4 py-1 text-sm'} ${tab === id ? 'bg-emerald-600 text-white' : 'bg-emerald-200/70 hover:bg-emerald-200'}`}
              >
                {t(`codex.tab.${id}`)}{' '}
                <span className="opacity-75">
                  {p.unlocked}/{p.total}
                </span>
              </button>
            );
          })}
        </div>
        <div className={`flex min-h-0 flex-1 ${touch ? 'flex-col gap-2' : 'gap-4'}`}>
          <ul className={`flex flex-col gap-1 overflow-y-auto pr-1 ${touch ? 'max-h-[34%] shrink-0' : 'w-64'}`} data-testid="codex-list">
            {list.map((e, i) => {
              const known = unlocked.includes(e.id);
              const showHeader = i === 0 || list[i - 1]!.map !== e.map;
              return (
                <li key={e.id}>
                  {showHeader && <p className="mt-1 mb-0.5 text-xs font-bold tracking-wide text-emerald-700">{t(`codex.map.${e.map}`)}</p>}
                  <button
                    type="button"
                    data-testid="codex-entry"
                    data-entry={e.id}
                    data-unlocked={known}
                    onClick={() => setSelected(e.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 text-left ${touch ? 'py-1 text-xs' : 'py-1.5 text-sm'} ${current?.id === e.id ? 'bg-emerald-300/70 font-bold' : 'hover:bg-emerald-200/60'} ${known ? '' : 'text-emerald-900/50'}`}
                  >
                    {e.unlock.type === 'item' && known && <ItemIcon icon={items.get(e.unlock.item)?.icon ?? ''} className="h-5 w-5 shrink-0" />}
                    <span className="flex-1">{known ? codexName(e) : t('codex.locked.name')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className={`min-w-0 flex-1 overflow-y-auto rounded-xl bg-white/60 ${touch ? 'p-2.5 text-sm' : 'p-4'}`} data-testid="codex-detail">
            {current ? <CodexDetail entry={current} known={unlocked.includes(current.id)} /> : <p>{t('codex.empty')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CodexDetail({ entry, known }: { entry: CodexEntry; known: boolean }) {
  if (!known) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-bold">{t('codex.locked.name')}</h3>
        <p className="text-sm text-emerald-900/70">{t(`codex.locked.${entry.category}`)}</p>
      </div>
    );
  }
  const k = entry.textPrefix;
  const u = entry.unlock;
  return (
    <div className="flex flex-col gap-3 leading-relaxed" data-testid="codex-entry-detail" data-entry={entry.id}>
      <div className="flex items-center gap-2">
        {u.type === 'item' && <ItemIcon icon={items.get(u.item)?.icon ?? ''} className="h-9 w-9 shrink-0" />}
        <h3 className="text-lg font-bold">{codexName(entry)}</h3>
      </div>
      {entry.category === 'creature' && (
        <p className="text-sm">
          <span className="font-bold text-emerald-700">{t('codex.habitat')}：</span>
          {t(`${k}.habitat`)}
        </p>
      )}
      <p className="whitespace-pre-line">{u.type === 'item' ? t(items.get(u.item)?.descKey ?? `${k}.desc`) : t(`${k}.desc`)}</p>
      {entry.category === 'creature' && (
        <div>
          <p className="text-sm font-bold text-emerald-700">{t('codex.notes')}</p>
          <p className="text-sm">{t(`${k}.notes`)}</p>
        </div>
      )}
      {entry.category === 'material' && (
        <div>
          <p className="text-sm font-bold text-emerald-700">{t('codex.source')}</p>
          <p className="text-sm">{t(`${k}.source`)}</p>
        </div>
      )}
    </div>
  );
}
