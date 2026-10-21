import { createContext, useContext, type ReactNode } from 'react';

/**
 * 角色技能圖示（設計稿「角色技能 ICON」，四個職業各 8 個，共 32 個）。以 SVG 手繪，任何尺寸都清晰，不需要圖片資產。
 * 外框的顏色依職業：星光旅人藍、騎士金、法師紫、戰士紅；圖樣在圓形外框中央，48×48 座標。
 */

/** 職業外框色：底色、外圈、內圈 */
const tones = {
  traveler: { bg: '#1d4f8a', rim: '#9fd4ff', inner: '#2f6fb8' },
  knight: { bg: '#8a5a14', rim: '#ffd66b', inner: '#b07a22' },
  mage: { bg: '#4a2a86', rim: '#c9a8ff', inner: '#6a44b0' },
  warrior: { bg: '#7a2418', rim: '#ffb38a', inner: '#a8402c' },
} as const;

export type SkillTone = keyof typeof tones;
type Tone = SkillTone;

/** 指定外框色（例如法師的圖樣用在騎士的法術上時改成騎士金）；沒指定就用圖示本身的職業色 */
const ToneOverride = createContext<Tone | null>(null);

function Frame({ tone, children }: { tone: Tone; children: ReactNode }) {
  const c = tones[useContext(ToneOverride) ?? tone];
  return (
    <>
      <circle cx="24" cy="24" r="22" fill={c.bg} stroke={c.rim} strokeWidth="2.5" />
      <circle cx="24" cy="24" r="17" fill={c.inner} opacity="0.35" />
      {children}
    </>
  );
}

const icons = {
  // 星光旅人（萬能 / 輔助）
  starlight_heal: (
    <Frame tone="traveler">
      <path d="M20 12h8v8h8v8h-8v8h-8v-8h-8v-8h8z" fill="#c8f7d4" stroke="#3f9c63" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="2.5" fill="#fff6b0" />
    </Frame>
  ),
  starlight_shield: (
    <Frame tone="traveler">
      <path d="M24 10 L36 14 V24 C36 32 30 37 24 39 C18 37 12 32 12 24 V14 Z" fill="#cfe8ff" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M24 16 V32" stroke="#4d8fd6" strokeWidth="2" />
    </Frame>
  ),
  starlight_guide: (
    <Frame tone="traveler">
      <path d="M24 8 L27 21 L40 24 L27 27 L24 40 L21 27 L8 24 L21 21 Z" fill="#fff6b0" stroke="#ffffff" strokeWidth="1" />
    </Frame>
  ),
  starlight_burst: (
    <Frame tone="traveler">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="24" y1="24" x2="24" y2="10" stroke="#fff6b0" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${a} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="5" fill="#ffffff" />
    </Frame>
  ),
  blink: (
    <Frame tone="traveler">
      <path d="M13 31 Q24 9 35 18 Q41 24 31 30 Q23 34 23 26" fill="none" stroke="#9fe7ff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="13" cy="31" r="2.5" fill="#ffffff" />
    </Frame>
  ),
  group_heal: (
    <Frame tone="traveler">
      {/* 三個小十字排成三角形 */}
      {[
        { x: 24, y: 15 },
        { x: 16, y: 30 },
        { x: 32, y: 30 },
      ].map(({ x, y }) => (
        <path key={`${x}-${y}`} d={`M${x - 1.5} ${y - 5}h3v3.5h3.5v3h-3.5v3.5h-3v-3.5h-3.5v-3h3.5z`} fill="#c8f7d4" />
      ))}
    </Frame>
  ),
  starlight_link: (
    <Frame tone="traveler">
      <path d="M14 16 L34 16 L24 34 Z" fill="none" stroke="#9fe7ff" strokeWidth="2" />
      <circle cx="14" cy="16" r="3.5" fill="#fff6b0" />
      <circle cx="34" cy="16" r="3.5" fill="#fff6b0" />
      <circle cx="24" cy="34" r="3.5" fill="#fff6b0" />
    </Frame>
  ),
  starlight_blessing: (
    <Frame tone="traveler">
      <path d="M24 30 C12 28 8 18 10 12 C16 14 20 18 24 26 C28 18 32 14 38 12 C40 18 36 28 24 30 Z" fill="#ffffff" />
      <ellipse cx="24" cy="11" rx="6" ry="2.5" fill="none" stroke="#ffd66b" strokeWidth="2" />
    </Frame>
  ),

  // 騎士（防禦 / 控制）
  holy_slash: (
    <Frame tone="knight">
      <path d="M30 10 L38 10 L38 18 L18 38 L14 34 Z" fill="#eef4ff" stroke="#ffffff" strokeWidth="1" />
      <path d="M12 30 L20 38" stroke="#ffd66b" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M10 16 Q18 8 28 10" fill="none" stroke="#fff3c4" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </Frame>
  ),
  shield_block: (
    <Frame tone="knight">
      <path d="M24 10 L37 15 V25 C37 33 31 38 24 40 C17 38 11 33 11 25 V15 Z" fill="#ffd66b" stroke="#fff3c4" strokeWidth="1.5" />
      <path d="M24 16 V34 M17 24 H31" stroke="#8a5a14" strokeWidth="2.5" />
    </Frame>
  ),
  charge: (
    <Frame tone="knight">
      <path d="M13 14 L25 24 L13 34" fill="none" stroke="#ffd66b" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M24 14 L36 24 L24 34" fill="none" stroke="#fff3c4" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
    </Frame>
  ),
  holy_domain: (
    <Frame tone="knight">
      <circle cx="24" cy="24" r="16" fill="none" stroke="#ffd66b" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="11" fill="none" stroke="#fff3c4" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="5" fill="#fff3c4" />
    </Frame>
  ),
  taunt: (
    <Frame tone="knight">
      <path d="M10 12 H38 V30 H22 L16 36 V30 H10 Z" fill="#fff3c4" stroke="#8a5a14" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="23" y="16" width="2.5" height="9" rx="1" fill="#8a5a14" />
      <circle cx="24.25" cy="28" r="1.6" fill="#8a5a14" />
    </Frame>
  ),
  shield_guard: (
    <Frame tone="knight">
      <path d="M24 10 L37 15 V25 C37 33 31 38 24 40 C17 38 11 33 11 25 V15 Z" fill="#f4e2b0" stroke="#ffd66b" strokeWidth="2" />
      <path d="M24 17 V33 M18 23 H30" stroke="#b07a22" strokeWidth="3" />
    </Frame>
  ),
  binding_strike: (
    <Frame tone="knight">
      <ellipse cx="18" cy="24" rx="7" ry="4.5" fill="none" stroke="#ffd66b" strokeWidth="3" transform="rotate(-30 18 24)" />
      <ellipse cx="30" cy="24" rx="7" ry="4.5" fill="none" stroke="#fff3c4" strokeWidth="3" transform="rotate(30 30 24)" />
    </Frame>
  ),
  team_buff: (
    <Frame tone="knight">
      <circle cx="24" cy="17" r="4" fill="#fff3c4" />
      <circle cx="15" cy="23" r="3" fill="#fff3c4" />
      <circle cx="33" cy="23" r="3" fill="#fff3c4" />
      <path d="M18 36 Q24 28 30 36" fill="none" stroke="#fff3c4" strokeWidth="3" strokeLinecap="round" />
    </Frame>
  ),

  // 法師（遠程 / 爆發）
  fire_spell: (
    <Frame tone="mage">
      <path
        d="M24 8 C30 16 36 20 34 30 C33 38 28 40 24 40 C18 40 14 36 14 30 C14 24 18 22 20 16 C22 20 23 22 24 24 C26 18 25 14 24 8 Z"
        fill="#ff8a3d"
        stroke="#ffd36b"
        strokeWidth="1.5"
      />
    </Frame>
  ),
  frost_spell: (
    <Frame tone="mage">
      <path d="M24 8 V40 M10 16 L38 32 M10 32 L38 16" stroke="#bff0ff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3" fill="#ffffff" />
    </Frame>
  ),
  lightning: (
    <Frame tone="mage">
      <path d="M28 8 L16 26 H24 L20 40 L34 20 H26 L30 8 Z" fill="#ffe866" stroke="#fff6b0" strokeWidth="1" strokeLinejoin="round" />
    </Frame>
  ),
  magic_missile: (
    <Frame tone="mage">
      <path d="M8 36 L22 26 M12 40 L22 34" stroke="#c9a8ff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="30" cy="20" r="7.5" fill="#d9b8ff" stroke="#ffffff" strokeWidth="1.5" />
    </Frame>
  ),
  teleport: (
    <Frame tone="mage">
      <ellipse cx="24" cy="24" rx="14" ry="16" fill="none" stroke="#d9b8ff" strokeWidth="2.5" />
      <ellipse cx="24" cy="24" rx="7" ry="9" fill="none" stroke="#ffffff" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="2.5" fill="#ffffff" />
    </Frame>
  ),
  elemental_shield: (
    <Frame tone="mage">
      <polygon points="24,8 38,16 38,32 24,40 10,32 10,16" fill="none" stroke="#e0c8ff" strokeWidth="3" strokeLinejoin="round" />
      <polygon points="24,16 31,20 31,28 24,32 17,28 17,20" fill="#b08cff" opacity="0.6" />
    </Frame>
  ),
  meteor: (
    <Frame tone="mage">
      <path d="M6 10 L22 22 L18 26 Z" fill="#ffd08a" />
      <circle cx="29" cy="28" r="9" fill="#ff9a4d" stroke="#ffe0a8" strokeWidth="1.5" />
    </Frame>
  ),
  magic_amp: (
    <Frame tone="mage">
      <path d="M24 8 L36 22 H29 V40 H19 V22 H12 Z" fill="#e8d8ff" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
    </Frame>
  ),

  // 戰士（近戰 / 高傷）
  whirlwind: (
    <Frame tone="warrior">
      <path d="M12 24 A12 12 0 1 1 24 36" fill="none" stroke="#ffd0b0" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M17 24 A7 7 0 1 1 24 31" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
    </Frame>
  ),
  heavy_strike: (
    <Frame tone="warrior">
      <rect x="13" y="10" width="22" height="11" rx="2" fill="#dddddd" stroke="#ffffff" strokeWidth="1" />
      <rect x="22" y="20" width="4" height="20" rx="1.5" fill="#a06a3a" />
    </Frame>
  ),
  dash: (
    <Frame tone="warrior">
      <path d="M10 14 L22 24 L10 34 M20 14 L32 24 L20 34" fill="none" stroke="#ffd0b0" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M34 20 H40 M34 28 H40" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </Frame>
  ),
  war_cry: (
    <Frame tone="warrior">
      <path d="M10 20 H18 L34 10 V38 L18 28 H10 Z" fill="#ffd0a0" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      <path d="M38 18 Q42 24 38 30" fill="none" stroke="#ffd0a0" strokeWidth="2.5" strokeLinecap="round" />
    </Frame>
  ),
  counter: (
    <Frame tone="warrior">
      <path d="M24 10 L36 15 V25 C36 33 30 37 24 39 C18 37 12 33 12 25 V15 Z" fill="#ffd0b0" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M28 26 Q28 19 20 19 M22 15 L20 19 L23 21" fill="none" stroke="#7a2418" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  ),
  berserk: (
    <Frame tone="warrior">
      <path d="M14 12 L26 36 M22 10 L34 34 M30 12 L38 30" stroke="#ffb199" strokeWidth="3.5" strokeLinecap="round" />
    </Frame>
  ),
  lifesteal: (
    <Frame tone="warrior">
      <path
        d="M24 36 C12 28 10 22 12 18 C14 13 20 12 24 17 C28 12 34 13 36 18 C38 22 36 28 24 36 Z"
        fill="#ff6b6b"
        stroke="#ffd0d0"
        strokeWidth="1.5"
      />
    </Frame>
  ),
  earth_crash: (
    <Frame tone="warrior">
      <path d="M8 34 L16 26 L22 32 L30 22 L40 34 Z" fill="#c98a5a" stroke="#ffe0c0" strokeWidth="1" strokeLinejoin="round" />
      <path d="M24 30 L20 40 M30 22 L34 16" stroke="#7a4a24" strokeWidth="2" strokeLinecap="round" />
    </Frame>
  ),
} satisfies Record<string, ReactNode>;

/** 32 個技能圖示的 id（設計稿順序：旅人、騎士、法師、戰士） */
export type SkillIconId = keyof typeof icons;
export const SKILL_ICON_IDS = Object.keys(icons) as SkillIconId[];

/** 技能圖示；className 決定大小（例如 h-10 w-10），tone 改外框的職業色 */
export function SkillIcon({ id, className, tone }: { id: SkillIconId; className?: string; tone?: SkillTone }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" data-skill-icon={id}>
      <ToneOverride.Provider value={tone ?? null}>{icons[id]}</ToneOverride.Provider>
    </svg>
  );
}
