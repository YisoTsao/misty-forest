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
