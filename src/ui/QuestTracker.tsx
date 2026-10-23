import { countItem } from '@/game-core/inventory/inventory';
import { isQuestReady, isQuestTracked, objectiveProgress, type Objective } from '@/game-core/quest/quest';
import type { GameState } from '@/game-core/authority/rules';
import { buildables, npcs, quests, worldIndex } from '@/game/authority';
import { t } from '@/game/i18n';
import { useGameStore } from '@/game/state/gameStore';
import { useTouchUi } from '@/game/input/device';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { worldDataResult } from '@/game/worldData';
import { ItemIcon } from './ItemIcon';

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();

/** 任務追蹤（規格 6.5）：畫面左側列出進行中的任務、目標進度與回報對象。只讀權威狀態。 */
export function QuestTracker() {
  const state = useGameStateStore((s) => s.state);
  const playing = useGameStore((s) => s.screen === 'playing');
  // 手機版（任務 11M）：血條在左上，任務追蹤放在血條下面、窄一點
  const touch = useTouchUi();
  if (!playing) return null;
  // 任務日誌取消追蹤的不顯示（主線一定顯示，任務 7F）
  const active = [...quests.values()].filter((q) => isQuestTracked(state.quests[q.id], q));
  if (active.length === 0) return null;

  return (
    <div className={`pointer-events-none absolute flex flex-col gap-2 ${touch ? 'top-[7.5rem] left-3 w-52 portrait:w-44 text-xs' : 'top-36 left-4 w-64'}`} data-testid="quest-tracker">
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

export function ObjectiveRow({ objective: o, progress, state }: { objective: Objective; progress: { current: number; target: number }; state: GameState }) {
  switch (o.type) {
    case 'collect':
      return <ItemCount itemId={o.itemId} current={progress.current} target={progress.target} />;
    case 'activate': {
      // 啟動時要交出物品的機關（任務 7L 小窩要放野果）：還沒啟動時列出物品與持有數
      const done = progress.current >= progress.target;
      const placement = o.placementIds.length === 1 ? worldIndex.placement(o.placementIds[0]!) : undefined;
      const consume = (placement && worldIndex.prefab(placement.prefabId)?.activate?.consume) ?? [];
      if (consume.length === 0) return <SimpleRow descKey={o.descKey} progress={progress} />;
      return (
        <li className="flex flex-col gap-0.5">
          <span className={done ? 'text-emerald-300' : ''}>
            {done ? '✓ ' : ''}
            {t(o.descKey)}
          </span>
          {!done && (
            <ul className="ml-2 flex flex-col gap-0.5 text-xs">
              {consume.map((m) => (
                <ItemCount key={m.itemId} itemId={m.itemId} current={countItem(state.inventory, m.itemId)} target={m.count} />
              ))}
            </ul>
          )}
        </li>
      );
    }
    case 'defeat':
    case 'boss':
    case 'talk':
    case 'visit':
    case 'puzzle':
      return <SimpleRow descKey={o.descKey} progress={progress} />;
    case 'build': {
      // 建造目標（任務 7K 花圃）：還沒蓋好時列出需要的材料與目前持有數
      const done = progress.current >= progress.target;
      const materials = buildables.get(o.buildable)?.cost ?? [];
      return (
        <li className="flex flex-col gap-0.5">
          <span className={done ? 'text-emerald-300' : ''} data-testid="quest-build">
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

function SimpleRow({ descKey, progress }: { descKey: string; progress: { current: number; target: number } }) {
  const done = progress.current >= progress.target;
  return (
    <li className={`flex items-center gap-2 ${done ? 'text-emerald-300' : ''}`}>
      <span>{t(descKey)}</span>
      <span className="ml-auto font-mono" data-testid="quest-progress">
        {progress.current} / {progress.target}
      </span>
    </li>
  );
}
