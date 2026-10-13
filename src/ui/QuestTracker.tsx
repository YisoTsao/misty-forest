import { countItem } from '@/game-core/inventory/inventory';
import { isQuestReady, objectiveProgress, questStatus, type Objective } from '@/game-core/quest/quest';
import type { GameState } from '@/game-core/authority/rules';
import { npcs, quests, worldIndex } from '@/game/authority';
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
        const progress = objectiveProgress(state, q);
        return (
          <div key={q.id} data-quest={q.id} data-ready={ready} className="rounded-xl bg-black/50 px-3 py-2 text-sm text-white shadow">
            <p className="text-xs font-bold tracking-wide text-amber-300">{t('quest.tracker')}</p>
            <p className="font-bold">{t(q.nameKey)}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {q.objectives.map((o, i) => (
                <ObjectiveRow key={i} objective={o} progress={progress[i]!} state={state} />
              ))}
            </ul>
            {ready && giver && <p className="mt-1 text-xs text-amber-200">{t('quest.ready', { npc: t(giver.nameKey) })}</p>}
          </div>
        );
      })}
    </div>
  );
}

function ItemCount({ itemId, current, target }: { itemId: string; current: number; target: number }) {
  const def = items.get(itemId);
  const done = current >= target;
  return (
    <li className={`flex items-center gap-2 ${done ? 'text-emerald-300' : ''}`}>
      {def && <ItemIcon icon={def.icon} className="h-5 w-5" />}
      <span>{def ? t(def.nameKey) : itemId}</span>
      <span className="ml-auto font-mono" data-testid="quest-progress">
        {Math.min(current, target)} / {target}
      </span>
    </li>
  );
}

function ObjectiveRow({ objective: o, progress, state }: { objective: Objective; progress: { current: number; target: number }; state: GameState }) {
  switch (o.type) {
    case 'collect':
      return <ItemCount itemId={o.itemId} current={progress.current} target={progress.target} />;
    case 'repair': {
      // 修復目標：顯示要做的事；還沒修好時列出需要的材料與目前持有數
      const done = progress.current >= progress.target;
      const placement = worldIndex.placement(o.placementId);
      const materials = (placement && worldIndex.prefab(placement.prefabId)?.repair?.materials) ?? [];
      return (
        <li className="flex flex-col gap-0.5">
          <span className={done ? 'text-emerald-300' : ''} data-testid="quest-repair">
            {done ? '✓ ' : ''}
            {t(o.descKey)}
          </span>
          {!done && (
            <ul className="ml-2 flex flex-col gap-0.5 text-xs">
              {materials.map((m) => (
                <ItemCount key={m.itemId} itemId={m.itemId} current={countItem(state.inventory, m.itemId)} target={m.count} />
              ))}
            </ul>
          )}
        </li>
      );
    }
  }
}
