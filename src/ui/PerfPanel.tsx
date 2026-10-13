import { useEffect, useRef } from 'react';
import { perfStats } from '@/game/perfStats';

const fmt = new Intl.NumberFormat('en-US');

/** FPS / draw call / 三角面面板。以 setInterval 直接寫 DOM，不造成 React 重新渲染。 */
export function PerfPanel() {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!ref.current) return;
      ref.current.textContent =
        `FPS   ${perfStats.fps.toFixed(0).padStart(4)}  (${perfStats.frameMs.toFixed(1)} ms)\n` +
        `Draw  ${fmt.format(perfStats.drawCalls).padStart(4)}\n` +
        `Tris  ${fmt.format(perfStats.triangles)}\n` +
        `Geo ${perfStats.geometries}  Tex ${perfStats.textures}\n` +
        `Colliders ${perfStats.activeColliders}`;
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  return (
    <pre
      ref={ref}
      data-testid="perf-panel"
      className="pointer-events-none absolute top-3 left-3 rounded-lg bg-black/55 px-3 py-2 font-mono text-xs leading-5 text-lime-200"
    />
  );
}
