// 本機暫態：目前畫面上的迷霧程度（0 晴朗 – 1 迷霧），由 Lighting 每幀往目標推進。
// 物件形狀即 shader uniform（{ value }），渲染層直接把它當成 uMist 共用。
export const mistRuntime = { value: 0 };
