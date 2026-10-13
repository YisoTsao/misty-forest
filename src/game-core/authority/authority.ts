// Authority 介面（規格 3.2）：單人為 LocalAuthority（同一行程），Phase 6 加入 RemoteAuthority。
// 呼叫端只送指令、訂閱事件，不直接修改權威狀態。
import { applyEvents, handleCommand, type GameCommand, type GameEvent, type GameState, type RulesContext } from './rules';

export type AuthorityListener = (events: readonly GameEvent[], state: GameState) => void;

export interface Authority {
  /** 送出指令；結果以事件通知訂閱者 */
  send(command: GameCommand): void;
  subscribe(listener: AuthorityListener): () => void;
  getState(): GameState;
}

export class LocalAuthority implements Authority {
  private state: GameState;
  private readonly listeners = new Set<AuthorityListener>();

  constructor(
    initial: GameState,
    private readonly ctx: RulesContext,
  ) {
    this.state = initial;
  }

  send(command: GameCommand): void {
    const events = handleCommand(this.state, command, this.ctx);
    this.state = applyEvents(this.state, events, this.ctx);
    this.emit(events);
  }

  subscribe(listener: AuthorityListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): GameState {
    return this.state;
  }

  /** 新遊戲或讀取存檔時整個替換狀態（不產生遊戲事件） */
  replaceState(state: GameState): void {
    this.state = state;
    this.emit([]);
  }

  private emit(events: readonly GameEvent[]): void {
    for (const listener of this.listeners) listener(events, this.state);
  }
}
