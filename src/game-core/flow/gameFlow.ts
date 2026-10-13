// 遊戲流程（規格 6.9：主選單、暫停選單）。純狀態轉換，UI 與輸入只送出動作。

export type GameScreen = 'title' | 'playing' | 'paused';

export type FlowAction = 'startGame' | 'pause' | 'resume' | 'togglePause' | 'returnToTitle';

/** 回傳下一個畫面；不合法的轉換（例如在主選單按暫停）維持原狀。 */
export function nextScreen(screen: GameScreen, action: FlowAction): GameScreen {
  switch (action) {
    case 'startGame':
      return screen === 'title' ? 'playing' : screen;
    case 'pause':
      return screen === 'playing' ? 'paused' : screen;
    case 'resume':
      return screen === 'paused' ? 'playing' : screen;
    case 'togglePause':
      return screen === 'playing' ? 'paused' : screen === 'paused' ? 'playing' : screen;
    case 'returnToTitle':
      return screen === 'paused' ? 'title' : screen;
  }
}

/** 角色是否接受操作（主選單與暫停時都不行） */
export function isControllable(screen: GameScreen): boolean {
  return screen === 'playing';
}
