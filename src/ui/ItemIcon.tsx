import type { ReactNode } from 'react';

/** 物品圖示（items.json 的 icon 欄位）。以 SVG 繪製，任何尺寸都清晰，不需要額外的圖片資產。 */
const icons: Record<string, ReactNode> = {
  wood: (
    <>
      <rect x="6" y="17" width="34" height="14" rx="7" fill="#a86b3c" stroke="#5e3a1c" strokeWidth="2" transform="rotate(-18 24 24)" />
      <ellipse cx="38" cy="18.5" rx="5" ry="7" fill="#e7c08a" stroke="#5e3a1c" strokeWidth="2" transform="rotate(-18 38 18.5)" />
      <ellipse cx="38" cy="18.5" rx="2" ry="3" fill="none" stroke="#b07f4c" strokeWidth="1.5" transform="rotate(-18 38 18.5)" />
      <path d="M12 30 l8 -3 M16 34 l10 -3" stroke="#7a4a24" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  stone: (
    <>
      <path d="M9 33 Q7 22 16 15 Q25 9 34 14 Q42 19 40 30 Q38 38 26 39 Q13 40 9 33 Z" fill="#a9a79a" stroke="#55534c" strokeWidth="2" />
      <path d="M15 21 Q20 16 27 16" stroke="#d6d4c8" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M28 27 l5 4 M21 31 l3 -2" stroke="#7d7b70" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  flower: (
    <>
      <path d="M24 26 Q23 36 25 44" stroke="#4f8f34" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M25 38 Q31 33 35 35 Q31 40 25 39" fill="#7cc451" stroke="#3f7f2c" strokeWidth="1.2" />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="24" cy="13" rx="5.5" ry="8" fill="#ff8fbf" stroke="#c4517f" strokeWidth="1.5" transform={`rotate(${a} 24 20)`} />
      ))}
      <circle cx="24" cy="20" r="4.5" fill="#ffcf33" stroke="#c99a12" strokeWidth="1.5" />
    </>
  ),
  herb: (
    <>
      <path d="M24 44 Q22 30 14 18 Q12 12 16 9 Q22 14 24 26" fill="#6cc164" stroke="#2f7a3a" strokeWidth="1.8" />
      <path d="M24 44 Q26 30 34 18 Q36 12 32 9 Q26 14 24 26" fill="#8fd970" stroke="#2f7a3a" strokeWidth="1.8" />
      <path d="M24 44 Q24 28 24 8" stroke="#2f7a3a" strokeWidth="2" fill="none" />
      <circle cx="24" cy="7" r="3" fill="#f4fff0" stroke="#7fb27a" strokeWidth="1.2" />
    </>
  ),
  glow_moss: (
    <>
      <path d="M7 36 Q9 26 17 25 Q20 18 28 20 Q36 18 40 27 Q44 34 38 38 Q24 42 7 36 Z" fill="#3f8a63" stroke="#245a40" strokeWidth="2" />
      <path d="M12 33 Q18 29 22 31 M25 27 Q30 24 35 28" stroke="#8de6be" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      {[
        [15, 29],
        [23, 24],
        [31, 23],
        [36, 31],
        [20, 34],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill="#c8ffe6" stroke="#5fc79a" strokeWidth="1" />
      ))}
    </>
  ),
  moondew: (
    <>
      <path d="M24 44 Q24 30 22 18" stroke="#3f7f5a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M23 34 Q14 30 12 22 Q20 23 23 31" fill="#6fb886" stroke="#2f6a48" strokeWidth="1.5" />
      <path d="M24 30 Q33 27 36 19 Q28 19 24 27" fill="#86c99a" stroke="#2f6a48" strokeWidth="1.5" />
      <path d="M22 18 Q14 12 18 5 Q22 9 26 6 Q30 13 22 18 Z" fill="#dff1ff" stroke="#7aa6d6" strokeWidth="1.5" />
      <circle cx="22" cy="12" r="2.4" fill="#ffffff" stroke="#9cc3ee" strokeWidth="1" />
      <circle cx="31" cy="11" r="1.6" fill="#e9f6ff" />
    </>
  ),
  pollen: (
    <>
      <path d="M24 8 Q34 16 32 28 Q30 40 24 42 Q18 40 16 28 Q14 16 24 8 Z" fill="#efe8fb" stroke="#8b8aa8" strokeWidth="1.8" />
      {[
        [21, 20],
        [27, 24],
        [22, 31],
        [27, 34],
        [24, 15],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill="#ffe98a" stroke="#d9b440" strokeWidth="1" />
      ))}
      <circle cx="36" cy="12" r="2" fill="#fff6b8" />
      <circle cx="12" cy="18" r="1.6" fill="#fff6b8" />
    </>
  ),
  fiber: (
    <>
      <path d="M10 38 Q18 26 16 14 M18 40 Q26 28 24 10 M26 40 Q34 30 34 12" stroke="#8a5c3a" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M10 38 Q18 26 16 14 M18 40 Q26 28 24 10 M26 40 Q34 30 34 12" stroke="#c49a6c" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <ellipse cx="22" cy="27" rx="15" ry="3.5" fill="#5f9a6a" stroke="#2f6a48" strokeWidth="1.4" transform="rotate(-12 22 27)" />
    </>
  ),
  campfire: (
    <>
      <path d="M24 10 Q31 20 28 28 Q34 24 33 18 Q40 27 34 35 L14 35 Q8 26 16 18 Q16 25 21 27 Q17 18 24 10 Z" fill="#ff9a2e" stroke="#c45a10" strokeWidth="1.5" />
      <path d="M24 20 Q28 27 25 33 L21 33 Q19 27 24 20 Z" fill="#ffe27a" />
      <rect x="9" y="34" width="30" height="5" rx="2.5" fill="#8a5a33" transform="rotate(-10 24 36)" />
      <rect x="9" y="34" width="30" height="5" rx="2.5" fill="#a06a3d" transform="rotate(10 24 36)" />
    </>
  ),
  cottage: (
    <>
      <path d="M8 24 L24 10 L40 24 Z" fill="#4caf72" stroke="#256b42" strokeWidth="2" strokeLinejoin="round" />
      <rect x="12" y="24" width="24" height="16" fill="#f3e3c3" stroke="#8a6a44" strokeWidth="2" />
      <rect x="21" y="30" width="7" height="10" fill="#a06a3d" />
      <rect x="14" y="27" width="5" height="5" fill="#8fd3ff" stroke="#8a6a44" strokeWidth="1" />
    </>
  ),
  table: (
    <>
      <rect x="7" y="16" width="34" height="6" rx="2" fill="#b8834c" stroke="#6e4426" strokeWidth="1.8" />
      <rect x="11" y="22" width="4" height="16" fill="#966335" />
      <rect x="33" y="22" width="4" height="16" fill="#966335" />
    </>
  ),
  chair: (
    <>
      <rect x="15" y="8" width="5" height="32" rx="1.5" fill="#966335" />
      <rect x="15" y="10" width="16" height="12" rx="2" fill="#b8834c" stroke="#6e4426" strokeWidth="1.5" />
      <rect x="15" y="25" width="20" height="5" rx="1.5" fill="#b8834c" stroke="#6e4426" strokeWidth="1.5" />
      <rect x="30" y="30" width="4" height="10" fill="#966335" />
    </>
  ),
  stool: (
    <>
      <ellipse cx="24" cy="18" rx="13" ry="5" fill="#b8834c" stroke="#6e4426" strokeWidth="1.8" />
      <rect x="14" y="20" width="4" height="18" fill="#966335" transform="rotate(8 16 29)" />
      <rect x="30" y="20" width="4" height="18" fill="#966335" transform="rotate(-8 32 29)" />
    </>
  ),
  bench: (
    <>
      <rect x="5" y="20" width="38" height="6" rx="2" fill="#b8834c" stroke="#6e4426" strokeWidth="1.8" />
      <rect x="9" y="26" width="4" height="12" fill="#966335" />
      <rect x="35" y="26" width="4" height="12" fill="#966335" />
    </>
  ),
  lantern: (
    <>
      <rect x="22" y="22" width="4" height="20" fill="#5b4a3a" />
      <path d="M16 10 L32 10 L30 24 L18 24 Z" fill="#ffe27a" stroke="#5b4a3a" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="24" cy="17" r="10" fill="#fff4b0" opacity="0.35" />
    </>
  ),
  pumpkin: (
    <>
      <ellipse cx="24" cy="28" rx="15" ry="11" fill="#ff8a2a" stroke="#b9531a" strokeWidth="2" />
      <path d="M24 17 Q20 28 24 39 M24 17 Q28 28 24 39" stroke="#b9531a" strokeWidth="1.5" fill="none" />
      <rect x="22" y="11" width="4" height="7" rx="1.5" fill="#4f8f34" />
    </>
  ),
  flag: (
    <>
      <rect x="13" y="8" width="3" height="32" fill="#6e4426" />
      <path d="M16 9 L36 13 L16 19 Z" fill="#ff5a5a" stroke="#b02a2a" strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  gel: (
    <>
      <path d="M24 8 Q34 20 37 28 Q40 40 24 41 Q8 40 11 28 Q14 20 24 8 Z" fill="#b9a2e6" stroke="#6b55a3" strokeWidth="2" />
      <path d="M17 27 Q18 21 22 17" stroke="#efe6ff" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="29" cy="31" r="2.2" fill="#8e76c9" />
    </>
  ),
  starlight: (
    <>
      <circle cx="24" cy="24" r="16" fill="#fff4b0" opacity="0.55" />
      <path d="M24 5 Q27 20 43 24 Q27 28 24 43 Q21 28 5 24 Q21 20 24 5 Z" fill="#ffe066" stroke="#d69a12" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 13 Q25.5 22 34 24" stroke="#fffbe0" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
};

export function ItemIcon({ icon, className }: { icon: string; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {icons[icon] ?? <text x="24" y="31" textAnchor="middle" fontSize="20" fill="#888">?</text>}
    </svg>
  );
}
