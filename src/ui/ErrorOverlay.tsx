import { useErrorStore } from '@/game/state/errorStore';

/** 執行期錯誤清單（非致命）。 */
export function ErrorOverlay() {
  const errors = useErrorStore((s) => s.errors);
  if (errors.length === 0) return null;
  return (
    <div role="alert" className="absolute bottom-3 left-3 max-w-xl rounded-lg bg-red-900/85 px-3 py-2 text-sm text-white">
      {errors.map((e) => (
        <p key={e}>{e}</p>
      ))}
    </div>
  );
}
