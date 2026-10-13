import { objectiveProgress, questStatus, isQuestReady } from '@/game-core/quest/quest';
import { npcs, quests } from '@/game/authority';
import { t } from '@/game/i18n';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { worldDataResult } from '@/game/worldData';
import { ItemIcon } from './ItemIcon';

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();

/** 任務追蹤（規格 6.5）：畫面左側列出進行中的任務、目標進度與回報對象。只讀權威狀態。 */
export function QuestTracker() {
  const state = useGameStateStore((s) => s.state);
  const playing = useGameStore((s) => s.screen === 'playing');
  if (!playing) return null;
  const active = [...quests.values()].filter((q) => questStatus(state, q) === 'active');
  if (active.length === 0) return null;

  return (
    <div className="pointer-events-none absolute top-36 left-4 flex w-64 flex-col gap-2" data-testid="quest-tracker">
      {active.map((q) => {
        const ready = isQuestReady(state, q);
        const giver = npcs.find((n) => n.id === q.giver);
        return (
          <div key={q.id} data-quest={q.id} data-ready={ready} className="rounded-xl bg-black/50 px-3 py-2 text-sm text-white shadow">
            <p className="text-xs font-bold tracking-wide text-amber-300">{t('quest.tracker')}</p>
            <p className="font-bold">{t(q.nameKey)}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {q.objectives.map((o, i) => {
                const p = objectiveProgress(state, q)[i]!;
                const def = items.get(o.itemId);
                const done = p.current >= p.target;
                return (
                  <li key={i} className={`flex items-center gap-2 ${done ? 'text-emerald-300' : ''}`}>
                    {def && <ItemIcon icon={def.icon} className="h-5 w-5" />}
                    <span>{def ? t(def.nameKey) : o.itemId}</span>
                    <span className="ml-auto font-mono" data-testid="quest-progress">
                      {p.current} / {p.target}
                    </span>
                  </li>
                );
              })}
            </ul>
            {ready && giver && <p className="mt-1 text-xs text-amber-200">{t('quest.ready', { npc: t(giver.nameKey) })}</p>}
          </div>
        );
      })}
    </div>
  );
}
