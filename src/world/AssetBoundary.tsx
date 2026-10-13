import { Component, type ReactNode } from 'react';
import { useErrorStore } from '@/game/state/errorStore';

type Props = { name: string; children: ReactNode };
type State = { failed: boolean };

/**
 * 3D 場景內的錯誤邊界：單一資產或子系統失敗時，只隱藏該部分並回報錯誤，
 * 世界其餘部分照常運作（規格 11：缺資產要有明確錯誤處理）。
 */
export class AssetBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${this.props.name}]`, error);
    useErrorStore.getState().reportError(`${this.props.name}：${message}`);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
