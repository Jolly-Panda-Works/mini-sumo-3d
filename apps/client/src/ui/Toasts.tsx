import { useStore } from "../store";
import { uiStore } from "../uiStore";

export function Toasts() {
  const { toasts } = useStore(uiStore);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <p key={t.id} className={`toast toast--${t.tone}`}>
          {t.text}
        </p>
      ))}
    </div>
  );
}
