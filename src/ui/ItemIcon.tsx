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
  fang: (
    <>
      <path d="M14 10 Q26 14 32 40 Q24 30 14 28 Q18 20 14 10 Z" fill="#f2efe6" stroke="#8c8476" strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  pelt: (
    <>
      <path d="M10 14 Q24 8 38 14 L40 36 Q24 42 8 36 Z" fill="#9c6b44" stroke="#5e3d24" strokeWidth="2" />
      <path d="M16 20 L18 34 M24 18 L24 36 M32 20 L30 34" stroke="#c99b6c" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  bark: (
    <>
      <path d="M16 6 Q12 24 18 42 L30 42 Q36 24 32 6 Z" fill="#7a5638" stroke="#4a3322" strokeWidth="2" />
      <path d="M22 10 L23 40 M27 12 L26 38" stroke="#4a3322" strokeWidth="1.4" />
    </>
  ),
  heartwood: (
    <>
      <circle cx="24" cy="24" r="16" fill="#b98656" stroke="#6b4a2c" strokeWidth="2.2" />
      <circle cx="24" cy="24" r="10" fill="none" stroke="#8c5f36" strokeWidth="1.6" />
      <circle cx="24" cy="24" r="4" fill="#d9a870" stroke="#6b4a2c" strokeWidth="1.2" />
    </>
  ),
  crystal: (
    <>
      <path d="M24 6 L36 22 L24 42 L12 22 Z" fill="#8fd3ff" stroke="#3f7fb8" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 6 L24 42 M12 22 L36 22" stroke="#d9f1ff" strokeWidth="1.2" />
    </>
  ),
  resin: (
    <>
      <path d="M24 6 Q36 24 34 32 Q30 42 24 42 Q16 42 14 32 Q12 24 24 6 Z" fill="#e2a24a" stroke="#9a6320" strokeWidth="2" />
      <ellipse cx="20" cy="30" rx="2.4" ry="4" fill="#fff0c2" opacity="0.8" />
    </>
  ),
  glow_knife: (
    <>
      <path d="M12 36 L34 10 L38 14 L16 40 Z" fill="#d6f7ea" stroke="#3f8a6a" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 38 L16 32" stroke="#6b4a2c" strokeWidth="4" strokeLinecap="round" />
      <circle cx="34" cy="12" r="3" fill="#8de6be" />
    </>
  ),
  glow_staff: (
    <>
      <path d="M24 44 L24 14" stroke="#6b4a2c" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="24" cy="12" r="6" fill="#8de6be" stroke="#3f8a6a" strokeWidth="1.8" />
      <circle cx="24" cy="12" r="2.4" fill="#f4fff8" />
    </>
  ),
  forest_bracer: (
    <>
      <path d="M10 18 Q24 12 38 18 L36 34 Q24 40 12 34 Z" fill="#7a5638" stroke="#3f2c1c" strokeWidth="2" />
      <path d="M14 22 L34 22 M13 28 L35 28" stroke="#b98656" strokeWidth="1.6" />
      <circle cx="24" cy="25" r="2.6" fill="#8de6be" />
    </>
  ),
  star_compass: (
    <>
      <circle cx="24" cy="24" r="17" fill="#2b3a52" stroke="#d9b75a" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="12" fill="none" stroke="#8fa6c9" strokeWidth="1.2" />
      <path d="M24 8 L27 24 L24 40 L21 24 Z" fill="#f4e3a1" stroke="#b8923a" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M24 24 L40 24 L24 27 Z" fill="#7fc8ff" opacity="0.8" />
      <circle cx="24" cy="24" r="2.2" fill="#fff8dc" />
    </>
  ),
  pure_glowmoss: (
    <>
      <path d="M8 38 Q10 28 18 27 Q21 20 28 22 Q36 20 40 29 Q44 36 38 40 Q24 44 8 38 Z" fill="#2f6f58" stroke="#1d4d3c" strokeWidth="2" />
      <path d="M14 35 Q20 31 24 33 M27 29 Q32 26 36 30" stroke="#b8fff0" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M24 30 L26 22 L24 14 L22 22 Z M24 30 L31 25 L33 29 Z M24 30 L17 25 L15 29 Z" fill="#e8fffb" stroke="#7fe3d0" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="24" cy="30" r="2.6" fill="#ffffff" />
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
  moondew_salve: (
    <>
      <ellipse cx="24" cy="33" rx="15" ry="7" fill="#c9d6d2" stroke="#5b6b66" strokeWidth="2" />
      <path d="M9 24 L9 33 A15 7 0 0 0 39 33 L39 24 Z" fill="#dfe8e4" stroke="#5b6b66" strokeWidth="2" />
      <ellipse cx="24" cy="24" rx="15" ry="7" fill="#9fe3c4" stroke="#5b6b66" strokeWidth="2" />
      <ellipse cx="22" cy="23" rx="7" ry="2.6" fill="#d9fff0" />
      <circle cx="30" cy="25" r="1.6" fill="#ffffff" />
      <path d="M17 15 Q20 9 24 15 Q28 9 31 15" stroke="#7fb8e0" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </>
  ),
  moss_cap: (
    <>
      <path d="M8 26 Q8 10 24 9 Q40 10 40 26 Q32 30 24 30 Q16 30 8 26 Z" fill="#f1e4c4" stroke="#8a7458" strokeWidth="2" />
      <path d="M8 26 Q16 30 24 30 Q32 30 40 26" stroke="#8a7fa8" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M19 30 Q18 38 20 41 Q24 43 28 41 Q30 38 29 30" fill="#e8dcc0" stroke="#8a7458" strokeWidth="1.8" />
      <circle cx="18" cy="17" r="2.6" fill="#fff8e6" />
      <circle cx="29" cy="15" r="2" fill="#fff8e6" />
      <circle cx="33" cy="21" r="1.6" fill="#8de6be" />
      <path d="M12 41 Q16 38 20 41" stroke="#386b53" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M28 41 Q32 38 36 41" stroke="#386b53" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  ),
  symbol_dawn: (
    <>
      <circle cx="24" cy="24" r="16" fill="#9a968b" stroke="#5e5a52" strokeWidth="2.4" />
      <circle cx="24" cy="24" r="5" fill="#ffd77a" />
      <path d="M24 12 V16 M24 32 V36 M12 24 H16 M32 24 H36 M15.5 15.5 L18.4 18.4 M29.6 29.6 L32.5 32.5 M32.5 15.5 L29.6 18.4 M18.4 29.6 L15.5 32.5" stroke="#ffd77a" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  symbol_sprout: (
    <>
      <circle cx="24" cy="24" r="16" fill="#9a968b" stroke="#5e5a52" strokeWidth="2.4" />
      <path d="M24 33 V22" stroke="#8de6be" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24 24 Q16 23 16 16 Q23 17 24 24 Z M24 22 Q31 20 32 14 Q25 14 24 22 Z" fill="#8de6be" />
    </>
  ),
  symbol_tide: (
    <>
      <circle cx="24" cy="24" r="16" fill="#9a968b" stroke="#5e5a52" strokeWidth="2.4" />
      <path d="M13 21 Q16 18 19 21 T25 21 T31 21 T35 21 M13 28 Q16 25 19 28 T25 28 T31 28 T35 28" stroke="#8fd0ff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  ),
  lore_tablet: (
    <>
      <path d="M12 8 H36 Q38 8 38 10 V40 Q38 42 36 42 H12 Q10 42 10 40 V10 Q10 8 12 8 Z" fill="#a8a294" stroke="#5e5a52" strokeWidth="2" />
      <circle cx="24" cy="17" r="4" fill="#fff2c0" />
      <path d="M15 26 H33 M15 31 H33 M15 36 H27" stroke="#6b665c" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  berry: (
    <>
      <path d="M24 10 Q28 6 33 8 Q30 13 24 12 Z" fill="#4f8a3a" />
      <circle cx="18" cy="26" r="8" fill="#d23a4a" stroke="#8e2a3a" strokeWidth="1.6" />
      <circle cx="30" cy="27" r="8" fill="#c8304a" stroke="#8e2a3a" strokeWidth="1.6" />
      <circle cx="24" cy="35" r="7" fill="#8e2a6a" stroke="#5e1a4a" strokeWidth="1.6" />
      <path d="M24 12 V20 M18 18 L22 20 M30 19 L26 20" stroke="#4f6a2a" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="15.5" cy="23.5" r="1.8" fill="#ffd0d6" />
    </>
  ),
  footprint_charm: (
    <>
      <path d="M24 5 V12" stroke="#b39a74" strokeWidth="2" />
      <circle cx="24" cy="29" r="14" fill="#f6e8cf" stroke="#b39a74" strokeWidth="2" />
      <ellipse cx="24" cy="32" rx="5" ry="6" fill="#c98f6b" />
      <circle cx="18" cy="24" r="2.6" fill="#c98f6b" />
      <circle cx="24" cy="22" r="2.6" fill="#c98f6b" />
      <circle cx="30" cy="24" r="2.6" fill="#c98f6b" />
    </>
  ),
  letter: (
    <>
      <rect x="7" y="13" width="34" height="23" rx="2.5" fill="#f6eedb" stroke="#8a6a3a" strokeWidth="2" />
      <path d="M7.5 14 L24 27 L40.5 14" stroke="#8a6a3a" strokeWidth="2" fill="none" />
      <circle cx="24" cy="27" r="3.4" fill="#c8483a" />
      <path d="M10 33 Q14 31 17 34" stroke="#9fb7c9" strokeWidth="1.6" fill="none" />
    </>
  ),
  cloth: (
    <>
      <path d="M9 17 Q24 12 39 17 L37 27 Q24 23 11 27 Z" fill="#a9cfe0" stroke="#4f7a90" strokeWidth="2" />
      <path d="M11 26 Q24 22 37 26 L36 36 Q24 32 12 36 Z" fill="#f4efe2" stroke="#8a7a5a" strokeWidth="2" />
    </>
  ),
  postcard: (
    <>
      <rect x="6" y="11" width="36" height="26" rx="2" fill="#fff8e6" stroke="#8a6a3a" strokeWidth="2" />
      <rect x="9" y="14" width="15" height="20" rx="1" fill="#9fd0e6" />
      <path d="M16 34 V21 L18 18 L20 21 V34 Z" fill="#f2e2c0" stroke="#7a5a3a" strokeWidth="1" />
      <circle cx="18" cy="17.5" r="1.6" fill="#ffd77a" />
      <path d="M28 18 H38 M28 23 H38 M28 28 H35" stroke="#b39a74" strokeWidth="1.6" />
    </>
  ),
  seed_coin: (
    <>
      <circle cx="24" cy="24" r="16" fill="#e8c25a" stroke="#9a7420" strokeWidth="2.4" />
      <circle cx="24" cy="24" r="11.5" fill="none" stroke="#c99b33" strokeWidth="1.6" />
      <path d="M24 31 V22" stroke="#4f7a2a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 24 Q18 23 17 17 Q23 17 24 24 Z" fill="#6cc164" />
      <path d="M24 22 Q30 20 31 15 Q25 15 24 22 Z" fill="#8fd47a" />
    </>
  ),
  puff_horn: (
    <>
      <path d="M14 40 Q12 22 24 8 Q36 22 34 40 Q24 44 14 40 Z" fill="#cdb8ee" stroke="#7a62a8" strokeWidth="2" />
      <path d="M19 34 Q18 24 24 15" stroke="#f2e9ff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="29" cy="30" r="1.8" fill="#ffd77a" />
    </>
  ),
  lantern_shard: (
    <>
      <path d="M12 38 Q10 22 22 9 L34 14 Q26 26 28 40 Z" fill="#ffe7a3" stroke="#a07a32" strokeWidth="2" strokeLinejoin="round" />
      <path d="M17 33 Q16 23 23 14" stroke="#fffaf0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M12 38 L28 40" stroke="#8a6a2a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="36" cy="30" r="1.8" fill="#ffd77a" />
      <circle cx="38" cy="22" r="1.2" fill="#ffd77a" />
    </>
  ),
  dawn_resonance: (
    <>
      <circle cx="24" cy="25" r="17" fill="#ffd77a" opacity="0.25" />
      <circle cx="24" cy="25" r="10" fill="#ffe7a3" stroke="#d29a3a" strokeWidth="2" />
      <circle cx="24" cy="25" r="5" fill="#fffaf0" />
      <path d="M24 5 V11 M24 39 V45 M4 25 H10 M38 25 H44 M10 11 L14 15 M34 35 L38 39 M38 11 L34 15 M14 35 L10 39" stroke="#e8a845" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  dawn_charm: (
    <>
      <path d="M24 6 Q30 6 30 11" stroke="#8a6a3a" strokeWidth="2" fill="none" />
      <path d="M24 6 Q18 6 18 11" stroke="#8a6a3a" strokeWidth="2" fill="none" />
      <path d="M24 12 L36 22 L24 42 L12 22 Z" fill="#f6c86a" stroke="#9a6a2a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 17 L30 23 L24 34 L18 23 Z" fill="#fff3c4" />
      <circle cx="24" cy="24" r="2.4" fill="#ffffff" />
    </>
  ),
  resonance_bud: (
    <>
      <circle cx="24" cy="26" r="17" fill="#8de6be" opacity="0.28" />
      <circle cx="24" cy="26" r="11" fill="#8de6be" opacity="0.35" />
      <path d="M24 40 Q23 30 24 22" stroke="#2f7a3a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M24 25 Q14 24 11 15 Q21 13 24 25 Z" fill="#6cc164" stroke="#2f6a3a" strokeWidth="1.8" />
      <path d="M24 22 Q32 18 37 9 Q27 8 24 22 Z" fill="#9fe0b0" stroke="#2f6a3a" strokeWidth="1.8" />
      <ellipse cx="24" cy="41" rx="7" ry="3.2" fill="#8a6a4a" stroke="#5e3a1c" strokeWidth="1.5" />
      <circle cx="14" cy="34" r="1.6" fill="#fffbd0" />
      <circle cx="35" cy="28" r="1.4" fill="#fffbd0" />
      <circle cx="31" cy="38" r="1.1" fill="#fffbd0" />
    </>
  ),
  moss_cloth: (
    <>
      <path d="M9 12 Q24 8 39 12 L37 36 Q24 40 11 36 Z" fill="#5f9a6a" stroke="#2f5a3e" strokeWidth="2" />
      <path d="M11 36 Q24 40 37 36 L36 41 Q24 45 12 41 Z" fill="#386b53" stroke="#2f5a3e" strokeWidth="1.6" />
      <path d="M14 18 Q24 15 34 18 M13 25 Q24 22 35 25 M12 31 Q24 28 36 31" stroke="#8de6be" strokeWidth="1.4" fill="none" opacity="0.8" />
      <circle cx="17" cy="21" r="1.6" fill="#8de6be" />
      <circle cx="30" cy="28" r="1.4" fill="#8de6be" />
      <circle cx="23" cy="34" r="1.2" fill="#ffc6e8" />
    </>
  ),
  herb_potion: (
    <>
      <rect x="20" y="6" width="8" height="6" rx="1.5" fill="#a86f4b" stroke="#5e3a1c" strokeWidth="1.5" />
      <path d="M19 12 h10 v6 Q38 22 37 32 Q36 42 24 42 Q12 42 11 32 Q10 22 19 18 Z" fill="#e8f4ef" stroke="#4d6a5e" strokeWidth="2" />
      <path d="M12.5 29 Q24 25 35.5 29 Q35 40 24 40 Q13 40 12.5 29 Z" fill="#6cc164" />
      <path d="M16 22 Q15 27 16 30" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M24 36 Q22 31 25 28 Q27 32 24 36 Z" fill="#2f7a3a" />
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
  // 澄鏡湖的材料（任務 9B）
  pearl: (
    <>
      <path d="M8 34 Q24 22 40 34 Q24 44 8 34 Z" fill="#9fc3cf" stroke="#4f7f8f" strokeWidth="2" />
      <circle cx="24" cy="25" r="10" fill="#f6f2ff" stroke="#a9a3c8" strokeWidth="2" />
      <circle cx="20" cy="21" r="3" fill="#ffffff" />
      <circle cx="28" cy="29" r="1.6" fill="#e0dcf4" />
    </>
  ),
  water_essence: (
    <>
      <path d="M24 6 Q36 22 36 30 Q36 42 24 42 Q12 42 12 30 Q12 22 24 6 Z" fill="#77c9df" stroke="#2f7f9a" strokeWidth="2" />
      <path d="M18 30 Q18 24 22 19" stroke="#e8fbff" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="28" cy="33" r="3" fill="#b9ecf6" />
    </>
  ),
  feather: (
    <>
      <path d="M36 6 Q20 12 14 28 Q12 36 10 42 Q18 36 24 32 Q36 22 36 6 Z" fill="#c9d4e0" stroke="#5f6d82" strokeWidth="2" />
      <path d="M36 6 Q22 22 10 42" stroke="#5f6d82" strokeWidth="1.6" fill="none" />
      <path d="M33 10 Q30 16 26 18 M22 30 Q18 32 16 36" stroke="#3f4a5c" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
  tide_resonance: (
    <>
      <circle cx="24" cy="24" r="17" fill="#d9f4ff" opacity="0.5" />
      <circle cx="24" cy="24" r="11" fill="#77c9df" stroke="#2f7f9a" strokeWidth="2" />
      <path d="M16 22 Q20 18 24 22 T32 22 M16 28 Q20 24 24 28 T32 28" stroke="#f4fbff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="19" cy="18" r="2.4" fill="#ffffff" />
    </>
  ),
  reed_planter: (
    <>
      <path d="M14 32 L34 32 L31 43 L17 43 Z" fill="#b8834c" stroke="#6b4a2a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 32 Q19 18 17 8 M24 32 Q24 16 25 6 M28 32 Q30 20 33 10" stroke="#4f8a66" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <ellipse cx="17.5" cy="11" rx="1.8" ry="4" fill="#7a5233" />
      <ellipse cx="32.5" cy="13" rx="1.8" ry="4" fill="#7a5233" />
    </>
  ),
  mirror_lamp: (
    <>
      <rect x="22.5" y="20" width="3" height="20" fill="#7a5a3e" />
      <rect x="16" y="39" width="16" height="4" rx="2" fill="#8f9894" />
      <circle cx="24" cy="15" r="9" fill="#d8f4f8" stroke="#c8b27a" strokeWidth="2.4" />
      <circle cx="24" cy="15" r="3.2" fill="#ffffff" />
    </>
  ),
  tide_record: (
    <>
      <rect x="10" y="7" width="28" height="34" rx="3" fill="#f6eedb" stroke="#8a6a44" strokeWidth="2" />
      <path d="M15 18 Q19 14 24 18 T33 18 M15 25 Q19 21 24 25 T33 25 M15 32 Q19 28 24 32 T33 32" stroke="#3f7fc0" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </>
  ),
  mirror_shell: (
    <>
      <path d="M8 30 Q10 12 24 10 Q38 12 40 30 Q24 38 8 30 Z" fill="#4f9fa0" stroke="#2f6a6a" strokeWidth="2" />
      {[
        [17, 22],
        [24, 18],
        [31, 22],
        [21, 28],
        [28, 28],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" fill="#d8f4f8" stroke="#9fd0d8" strokeWidth="1" />
      ))}
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
