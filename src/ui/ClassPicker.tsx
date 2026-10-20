import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_HERO_CLASS, heroClassIds, type HeroClassId } from '@/game-core/character/heroClass';
import { heroClasses, weapons } from '@/game/authority';
import { spellsOf } from '@/game/character/currentClass';
import { t } from '@/game/i18n';

/**
 * 選職業（使用者 2026-10-17：初始角色從一名增加到四種職業）：新遊戲與第一次進入線上世界時顯示。
 * 每張卡片列出職業的稱號、介紹、能用的武器與三個法術（星光消耗）；選好後按「開始冒險」。
 */
export function ClassPicker({ onStart, onBack, busy = false }: { onStart: (heroClass: HeroClassId) => void; onBack: () => void; busy?: boolean }) {
  const [picked, setPicked] = useState<HeroClassId>(DEFAULT_HERO_CLASS);
  const chosen = heroClasses.get(picked);
  // 主選單的面板有 backdrop-filter（會成為絕對定位的容器），所以畫到 body 上蓋住整個畫面
  return createPortal(
    <div
      data-testid="class-picker"
      data-pad-scope
      role="dialog"
      aria-labelledby="class-picker-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center-safe gap-4 overflow-y-auto bg-slate-950/70 p-4 text-white backdrop-blur-sm"
    >
      <h2 id="class-picker-title" className="text-3xl font-black tracking-wider drop-shadow">
        {t('classPicker.title')}
      </h2>
      <p className="max-w-xl text-center text-sm opacity-80">{t('classPicker.hint')}</p>
      <div className="grid w-full max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {heroClassIds.map((id) => {
          const def = heroClasses.get(id);
          if (!def) return null;
          const active = id === picked;
          return (
            <button
              key={id}
              type="button"
              data-testid={`class-option-${id}`}
              aria-pressed={active}
              onClick={() => setPicked(id)}
              onDoubleClick={() => onStart(id)}
              className={`flex flex-col gap-2 rounded-2xl border-2 p-4 text-left transition ${
                active ? 'border-amber-300 bg-amber-400/20 shadow-[0_0_24px_rgba(252,211,77,0.35)]' : 'border-white/20 bg-black/35 hover:bg-white/10'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-3xl">{def.icon}</span>
                <span>
                  <span className="block text-lg font-bold">{t(def.nameKey)}</span>
                  <span className="block text-xs text-amber-200">{t(def.roleKey)}</span>
                </span>
              </span>
              <span className="text-xs leading-5 opacity-85">{t(def.descKey)}</span>
              <span className="text-xs">
                <span className="mr-1 font-bold text-amber-100">{t('classPicker.weapons')}</span>
                {def.weapons.map((w) => {
                  const weapon = weapons.weapons.get(w);
                  return (
                    <span key={w} className="mr-1.5 inline-block">
                      {weapon?.icon} {t(weapon?.nameKey ?? w)}
                    </span>
                  );
                })}
              </span>
              <span className="flex flex-col gap-0.5 text-xs" data-testid={`class-spells-${id}`}>
                <span className="font-bold text-amber-100">{t('classPicker.spells')}</span>
                {spellsOf(id).map((s) => (
                  <span key={s.id}>
                    {s.icon} {t(s.nameKey)} <span className="opacity-60">（{s.mpCost}）</span>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3">
        <button type="button" data-testid="class-back" onClick={onBack} className="rounded-full bg-white/15 px-6 py-2 hover:bg-white/25">
          {t('classPicker.back')}
        </button>
        <button
          type="button"
          data-testid="class-start"
          autoFocus
          disabled={busy || !chosen}
          onClick={() => onStart(picked)}
          className="rounded-full bg-amber-400 px-8 py-2 text-lg font-bold text-amber-950 shadow hover:bg-amber-300 disabled:opacity-60"
        >
          {t('classPicker.start', { name: chosen ? t(chosen.nameKey) : '' })}
        </button>
      </div>
    </div>,
    document.body,
  );
}
