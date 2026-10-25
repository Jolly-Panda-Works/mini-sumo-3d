import { createPortal } from "react-dom";
import { uiStore } from "../uiStore";
import { useStore } from "../store";

/**
 * Short notices ("+150 Sumo Coins", "Invite sent"…). They have their own layer at the end of
 * <body>, above the popup layer, so a notice is never hidden behind an open panel, the
 * results board or the match HUD; shown everywhere (home and in a room).
 */
let layer: HTMLElement | null = null;
function toastLayer(): HTMLElement {
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "toast-layer";
    layer.className = "toast-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

export function Toasts() {
  const { toasts } = useStore(uiStore);
  return createPortal(
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <p key={t.id} className={`toast toast--${t.tone}`}>
          {t.text}
        </p>
      ))}
    </div>,
    toastLayer(),
  );
}
