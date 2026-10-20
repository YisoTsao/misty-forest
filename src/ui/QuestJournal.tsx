import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '@/game-core/authority/rules';
import { isQuestReady, isQuestTracked, MAX_TRACKED_SIDE, objectiveProgress, questCategories, questStatus, trackedSideCount, type QuestDef, type QuestStatus } from '@/game-core/quest/quest';
import { MAPS, mapIdAt } from '@/game-core/world/maps';
import { authority, npcs, quests } from '@/game/authority';
import { t } from '@/game/i18n';
import { input } from '@/game/input/inputManager';
import { keyVars } from '@/game/input/keyLabels';
import { currentScreen, useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useBindings } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';
import { ItemIcon } from './ItemIcon';
import { currentQuestMarkers } from './map/mapDraw';
import { setWorldMapOpen } from './map/WorldMap';
import { ObjectiveRow } from './QuestTracker';

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();

type Tab = 'active' | 'available' | 'completed';
const TABS: Tab[] = ['active', 'available', 'completed'];

/** 開啟或關閉任務日誌（J、暫停選單）。開啟時釋放滑鼠、角色停下（isModalOpen） */
export function setJournalOpen(open: boolean): void {
  const ui = useUiStore.getState();
  if (ui.journalOpen === open) return;
  ui.setJournalOpen(open);
  if (open && document.pointerLockElement) document.exitPointerLock();
}

/**
 * 任務日誌（任務 7F，Bible §31.2）：進行中 / 可接取 / 已完成三個分頁，依主線、支線等分類。
 * 每個任務顯示名稱與發起人（所在地圖）、說明、目標與進度、可以回報時的對象、已知獎勵、是否有地圖標記；
 * 主線以外的任務可以切換追蹤（最多三個，Bible §31.3），追蹤中的才顯示在畫面左側。
 */
export function QuestJournal() {
  const open = useUiStore((s) => s.journalOpen);
  const playing = useGameStore((s) => s.screen === 'playing');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const ui = useUiStore.getState();
      if (ui.journalOpen && (e.code === 'Escape' || input.isBound(e.code, 'journal'))) {
        // 這個 Esc 只用來關日誌，不要再讓暫停選單收到
        e.stopImmediatePropagation();
        setJournalOpen(false);
        input.requestPointerLock();
        return;
      }
      if (!input.isBound(e.code, 'journal') || currentScreen() !== 'playing' || ui.message || ui.dialogue || ui.inventoryOpen || ui.mapOpen || ui.build) return;
      setJournalOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const title = useGameStore((s) => s.screen === 'title');
  useEffect(() => {
    if (title) useUiStore.getState().setJournalOpen(false);
  }, [title]);

  if (!open) return null;
  return <JournalWindow interactive={playing} />;
}

function statusTab(status: QuestStatus): Tab | null {
  return status === 'active' ? 'active' : status === 'available' ? 'available' : status === 'completed' ? 'completed' : null;
}

function JournalWindow({ interactive }: { interactive: boolean }) {
  const state = useGameStateStore((s) => s.state);
  const bindings = useBindings();
  const byTab = useMemo(() => {
    const out: Record<Tab, QuestDef[]> = { active: [], available: [], completed: [] };
    for (const q of quests.values()) {
      const tab = statusTab(questStatus(state, q));
      // 沒有發起人的探索任務（任務 7L）在發現之前不顯示（Bible §31.2：不直接顯示尚未發現的內容）
      if (tab === 'available' && !q.giver) continue;
      if (tab) out[tab].push(q);
    }
    // 主線排前面，其次依分類
    for (const list of Object.values(out)) list.sort((a, b) => questCategories.indexOf(a.category) - questCategories.indexOf(b.category));
    return out;
  }, [state]);
  const [tab, setTab] = useState<Tab>(() => (byTab.active.length > 0 ? 'active' : byTab.available.length > 0 ? 'available' : 'completed'));
  const list = byTab[tab];
  const [selected, setSelected] = useState<string | null>(null);
  const current = list.find((q) => q.id === selected) ?? list[0] ?? null;

  const close = () => {
    setJournalOpen(false);
    if (interactive) input.requestPointerLock();
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45" onClick={close}>
      <div
        role="dialog"
        aria-labelledby="journal-title"
        data-testid="quest-journal"
        data-pad-scope
        onClick={(e) => e.stopPropagation()}
        className="ui-panel flex h-[min(620px,85vh)] w-[min(880px,92vw)] flex-col gap-3 rounded-2xl border-4 border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="journal-title" className="text-xl font-bold">
            {t('journal.title')}
          </h2>
          <p className="text-xs text-amber-800">{t('journal.hint', keyVars(bindings))}</p>
        </div>
        <div className="flex gap-2" role="tablist">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`journal-tab-${id}`}
              onClick={() => {
                setTab(id);
                setSelected(null);
              }}
              className={`rounded-full px-4 py-1 text-sm font-bold ${tab === id ? 'bg-amber-500 text-white' : 'bg-amber-200/70 hover:bg-amber-200'}`}
            >
              {t(`journal.tab.${id}`)} <span className="opacity-70">{byTab[id].length}</span>
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 gap-4">
          <ul className="flex w-64 flex-col gap-1 overflow-y-auto pr-1" data-testid="journal-list">
            {list.length === 0 && <li className="text-sm text-amber-800">{t(`journal.empty.${tab}`)}</li>}
            {list.map((q, i) => {
              const showHeader = i === 0 || list[i - 1]!.category !== q.category;
              const tracked = isQuestTracked(state.quests[q.id], q);
              return (
                <li key={q.id}>
                  {showHeader && <p className="mt-1 mb-0.5 text-xs font-bold tracking-wide text-amber-700">{t(`journal.category.${q.category}`)}</p>}
                  <button
                    type="button"
                    data-testid="journal-entry"
                    data-quest={q.id}
                    onClick={() => setSelected(q.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${current?.id === q.id ? 'bg-amber-300/70 font-bold' : 'hover:bg-amber-200/60'}`}
                  >
                    <span className="flex-1">{t(q.nameKey)}</span>
                    {tab === 'active' && isQuestReady(state, q) && <span className="text-xs text-emerald-700">{t('journal.readyShort')}</span>}
                    {tab === 'active' && tracked && <span aria-label={t('journal.tracked')}>📌</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="min-w-0 flex-1 overflow-y-auto rounded-xl bg-white/60 p-4" data-testid="journal-detail">
            {current ? <QuestDetail quest={current} state={state} tab={tab} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function giverPlace(q: QuestDef): string | null {
  const npc = npcs.find((n) => n.id === q.giver);
  if (!npc) return null;
  const [x, z] = npc.position;
  return t(MAPS[mapIdAt(x, z)].nameKey);
}

function QuestDetail({ quest: q, state, tab }: { quest: QuestDef; state: GameState; tab: Tab }) {
  const giver = npcs.find((n) => n.id === q.giver);
  const ready = tab === 'active' && isQuestReady(state, q);
  const progress = objectiveProgress(state, q);
  const tracked = isQuestTracked(state.quests[q.id], q);
  const markers = tab === 'active' ? currentQuestMarkers(state).filter((m) => m.questId === q.id) : [];
  const trackFull = !tracked && trackedSideCount(state.quests, quests) >= MAX_TRACKED_SIDE;
  const rewards = q.rewards;
  return (
    <div className="flex flex-col gap-3" data-quest={q.id}>
      <div>
        <p className="text-xs font-bold tracking-wide text-amber-700">{t(`journal.category.${q.category}`)}</p>
        <h3 className="text-lg font-bold" data-testid="journal-quest-name">
          {t(q.nameKey)}
        </h3>
        {giver && (
          <p className="text-sm text-amber-800">
            {t('journal.giver', { npc: t(giver.nameKey), place: giverPlace(q) ?? '' })}
          </p>
        )}
      </div>
      <p className="text-sm leading-relaxed">{t(q.descKey)}</p>
      {tab === 'active' && (
        <div className="rounded-lg bg-black/70 px-3 py-2 text-sm text-white">
          <p className="mb-1 text-xs font-bold text-amber-300">{t('journal.objectives')}</p>
          <ul className="flex flex-col gap-0.5">
            {q.objectives.map((o, i) => (
              <ObjectiveRow key={i} objective={o} progress={progress[i]!} state={state} />
            ))}
          </ul>
          {ready && giver && <p className="mt-1 text-xs text-amber-200">{t('quest.ready', { npc: t(giver.nameKey) })}</p>}
        </div>
      )}
      {tab === 'available' && giver && <p className="text-sm font-bold text-emerald-800">{t('journal.availableHint', { npc: t(giver.nameKey) })}</p>}
      {tab === 'completed' && <p className="text-sm font-bold text-emerald-800">{t('journal.done')}</p>}
      {(rewards.items?.length || rewards.mist?.length) && (
        <div>
          <p className="mb-1 text-xs font-bold text-amber-700">{t('journal.rewards')}</p>
          <ul className="flex flex-wrap gap-2 text-sm" data-testid="journal-rewards">
            {(rewards.items ?? []).map((r) => {
              const def = items.get(r.itemId);
              return (
                <li key={r.itemId} className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5">
                  {def && <ItemIcon icon={def.icon} className="h-5 w-5" />}
                  {def ? t(def.nameKey) : r.itemId} ×{r.count}
                </li>
              );
            })}
            {(rewards.mist ?? []).map((m) => (
              <li key={m.region} className="rounded-full bg-sky-100 px-2 py-0.5">
                {t(`journal.mist.${m.stage}`, { region: t(`region.${m.region}`) })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {tab === 'active' && (
        <div className="flex flex-wrap items-center gap-2">
          {markers.length > 0 ? (
            <button
              type="button"
              data-testid="journal-show-map"
              onClick={() => {
                useUiStore.getState().setJournalOpen(false);
                setWorldMapOpen(true);
              }}
              className="rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-amber-950 hover:bg-amber-300"
            >
              {t('journal.showMap')}
            </button>
          ) : (
            <span className="text-xs text-amber-700">{t('journal.noMarker')}</span>
          )}
          {q.category !== 'main' && (
            <button
              type="button"
              data-testid="journal-track"
              disabled={trackFull}
              onClick={() => authority.send({ type: 'TrackQuest', quest: q.id, tracked: !tracked })}
              className="rounded-full bg-white/80 px-3 py-1 text-sm font-bold hover:bg-white disabled:opacity-50"
            >
              {tracked ? t('journal.untrack') : trackFull ? t('journal.trackFull', { max: MAX_TRACKED_SIDE }) : t('journal.track')}
            </button>
          )}
          {q.category === 'main' && <span className="text-xs text-amber-700">{t('journal.mainAlwaysTracked')}</span>}
        </div>
      )}
    </div>
  );
}
