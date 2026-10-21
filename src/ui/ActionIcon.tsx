import type { ReactNode } from 'react';

/**
 * 按鈕圖示（武器、觸控按鈕、選單鈕）。取代原本的 emoji：emoji 在各平台長得不一樣（Android、Windows 有的是黑白字），
 * 也跟技能圖示（SkillIcon）的手繪風格不搭。以 SVG 繪製，48×48 座標，畫在深色半透明的按鈕底上。
 */
const OUTLINE = '#2a1d12';

const icons = {
  // ── 武器（weapons.json 的 id）──
  fist: (
    <>
      <path d="M13 22 Q13 15 19 15 H31 Q37 15 37 21 V30 Q37 38 28 39 H21 Q13 38 13 30 Z" fill="#f2c79a" stroke={OUTLINE} strokeWidth="2" />
      <path d="M19 15 V23 M25 15 V23 M31 15 V23" stroke={OUTLINE} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 25 Q20 24 23 29" fill="none" stroke={OUTLINE} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  knife: (
    <>
      <path d="M33 9 Q39 12 30 24 L22 28 L20 26 Z" fill="#e6eef5" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M18 24 L24 30" stroke="#c9a24a" strokeWidth="4" strokeLinecap="round" />
      <path d="M19 29 L11 38" stroke="#8a5a32" strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  sword: (
    <>
      <path d="M38 7 L40 9 L21 30 L18 27 Z" fill="#e6eef5" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 25 L23 34" stroke="#d8b04a" strokeWidth="4" strokeLinecap="round" />
      <path d="M17 31 L10 38" stroke="#8a5a32" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="9" cy="39" r="2.6" fill="#d8b04a" stroke={OUTLINE} strokeWidth="1.2" />
    </>
  ),
  greatsword: (
    <>
      <path d="M36 5 L43 6 L42 12 L22 32 L16 26 Z" fill="#dfe8f0" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M38 9 L20 27" stroke="#a9b8c6" strokeWidth="1.5" />
      <path d="M11 23 L25 37" stroke="#c9a24a" strokeWidth="5" strokeLinecap="round" />
      <path d="M17 31 L8 40" stroke="#6e4426" strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  staff: (
    <>
      <path d="M30 18 L12 41" stroke="#8a5a32" strokeWidth="4" strokeLinecap="round" />
      <path d="M27 13 Q30 20 36 21" fill="none" stroke="#6e4426" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="34" cy="13" r="7" fill="#b48cff" stroke="#f1e6ff" strokeWidth="2" />
      <circle cx="32" cy="11" r="2" fill="#ffffff" />
    </>
  ),
  axe: (
    <>
      <path d="M31 10 L13 40" stroke="#8a5a32" strokeWidth="4" strokeLinecap="round" />
      <path d="M26 12 Q34 4 42 12 Q38 22 30 22 Z" fill="#d7e0e8" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  greataxe: (
    <>
      <path d="M26 7 L22 42" stroke="#6e4426" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M25 12 Q34 4 41 10 Q42 21 34 26 Q30 20 25 20 Z" fill="#d7e0e8" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M25 12 Q16 4 9 10 Q8 21 16 26 Q20 20 25 20 Z" fill="#c3ced8" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  // ── 觸控按鈕 ──
  heavy: (
    <>
      <path d="M24 5 L28 17 L40 12 L32 23 L43 30 L30 30 L31 43 L23 33 L14 42 L16 29 L5 26 L16 20 L10 9 L21 16 Z" fill="#ffb347" stroke="#ffe7b8" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="24" cy="25" r="5.5" fill="#fff3c4" />
    </>
  ),
  interact: (
    <>
      <path
        d="M15 26 V15 Q15 12.5 17.5 12.5 Q20 12.5 20 15 V22 V11 Q20 8.5 22.5 8.5 Q25 8.5 25 11 V22 V12 Q25 9.5 27.5 9.5 Q30 9.5 30 12 V23 V16 Q30 13.5 32.5 13.5 Q35 13.5 35 16 V29 Q35 40 25 40 Q18 40 14 33 L9 25 Q8 22 11 21.5 Q13 21 15 26 Z"
        fill="#ffe0bd"
        stroke={OUTLINE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </>
  ),
  jump: (
    <>
      <path d="M8 40 H40" stroke="#a6e3a1" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 34 V12 M14 21 L24 10 L34 21" fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  cycle: (
    <>
      <path d="M12 21 Q14 11 25 11 Q32 11 36 17" fill="none" stroke="#9fe7ff" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M38 9 L37 19 L28 17" fill="none" stroke="#9fe7ff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 27 Q34 37 23 37 Q16 37 12 31" fill="none" stroke="#ffd66b" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M10 39 L11 29 L20 31" fill="none" stroke="#ffd66b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  heal: (
    <>
      <rect x="19" y="6" width="10" height="5" rx="1.5" fill="#c99a5a" stroke={OUTLINE} strokeWidth="1.5" />
      <path d="M20 11 V17 Q10 21 10 30 Q10 41 24 41 Q38 41 38 30 Q38 21 28 17 V11 Z" fill="#ff6f7d" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M21.5 24 h5 v4 h4 v5 h-4 v4 h-5 v-4 h-4 v-5 h4 z" fill="#ffffff" />
      <path d="M14 27 Q15 22 19 20" fill="none" stroke="#ffc2c8" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  // ── 選單鈕 ──
  pause: (
    <>
      <rect x="14" y="11" width="7" height="26" rx="2.5" fill="#ffffff" />
      <rect x="27" y="11" width="7" height="26" rx="2.5" fill="#ffffff" />
    </>
  ),
  inventory: (
    <>
      <path d="M18 12 Q18 6 24 6 Q30 6 30 12" fill="none" stroke="#e8c48a" strokeWidth="3" />
      <path d="M11 20 Q11 12 19 12 H29 Q37 12 37 20 V38 Q37 42 33 42 H15 Q11 42 11 38 Z" fill="#c9884a" stroke={OUTLINE} strokeWidth="2" />
      <rect x="16" y="26" width="16" height="10" rx="2.5" fill="#a86b3c" stroke={OUTLINE} strokeWidth="1.8" />
      <path d="M24 26 V30" stroke="#ffd66b" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  map: (
    <>
      <path d="M7 13 L18 9 L30 13 L41 9 V35 L30 39 L18 35 L7 39 Z" fill="#f3e3b8" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M18 9 V35 M30 13 V39" stroke="#c9a86a" strokeWidth="1.5" />
      <path d="M11 30 Q17 22 23 26 T35 18" fill="none" stroke="#d24f3c" strokeWidth="2" strokeDasharray="3 2.5" strokeLinecap="round" />
      <circle cx="35" cy="18" r="2.5" fill="#d24f3c" />
    </>
  ),
  journal: (
    <>
      <path d="M11 9 H33 Q37 9 37 13 V39 Q37 41 35 41 H13 Q11 41 11 39 Z" fill="#7a9a5a" stroke={OUTLINE} strokeWidth="2" />
      <path d="M15 9 V41" stroke={OUTLINE} strokeWidth="1.8" />
      <rect x="19" y="14" width="13" height="8" rx="1.5" fill="#f6eedb" />
      <path d="M28 41 V46 L31 43.5 L34 46 V41" fill="#d24f3c" />
    </>
  ),
  companion: (
    <>
      <path d="M24 42 Q24 30 24 22" stroke="#4f8f34" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 26 Q12 28 9 16 Q20 13 24 24" fill="#8fd970" stroke="#2f7a3a" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M24 22 Q34 22 39 10 Q27 8 24 20" fill="#b6ec8a" stroke="#2f7a3a" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M38 30 L39.5 33.5 L43 35 L39.5 36.5 L38 40 L36.5 36.5 L33 35 L36.5 33.5 Z" fill="#fff6b0" />
    </>
  ),
  chat: (
    <>
      <path d="M8 12 Q8 8 12 8 H36 Q40 8 40 12 V29 Q40 33 36 33 H21 L13 40 V33 H12 Q8 33 8 29 Z" fill="#ffffff" stroke={OUTLINE} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="17" cy="20.5" r="2.4" fill="#5a6b80" />
      <circle cx="24" cy="20.5" r="2.4" fill="#5a6b80" />
      <circle cx="31" cy="20.5" r="2.4" fill="#5a6b80" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type ActionIconId = keyof typeof icons;
export const ACTION_ICON_IDS = Object.keys(icons) as ActionIconId[];

export function isActionIconId(id: string): id is ActionIconId {
  return id in icons;
}

/** 按鈕圖示；className 決定大小。不認得的 id（例如新加的武器還沒有圖示）不畫任何東西 */
export function ActionIcon({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" data-action-icon={id}>
      {isActionIconId(id) ? icons[id] : null}
    </svg>
  );
}
