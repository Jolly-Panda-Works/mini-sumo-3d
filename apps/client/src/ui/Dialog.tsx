import { useEffect, useId, useRef, type ReactNode } from "react";
import { audio } from "../audio/AudioManager";

const BASE = import.meta.env.BASE_URL;

/**
 * Shared popup in the wooden shrine frame: the title sits on the plaque at the top, the
 * close button on the top-right corner, and the content stays inside the frame (it scrolls
 * under the plaque's paper streamers, never over the wood).
 * Sizes are in container units (cqw) of .dialog-wrap, so the art scales with the popup.
 */
export function Dialog({
  title,
  onClose,
  className = "",
  children,
  footer,
  role = "dialog",
  bodyClassName = "",
  hideClose = false,
  overlayClassName = "",
}: {
  title: ReactNode;
  onClose: () => void;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
  role?: "dialog" | "alertdialog";
  bodyClassName?: string;
  /** For dialogs whose own buttons close them (e.g. "Not now"). */
  hideClose?: boolean;
  overlayClassName?: string;
}) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    audio.sample("menu-open");
    return () => audio.sample("menu-close");
  }, []);

  const wrapClass = className
    .split(/\s+/)
    .filter(Boolean)
    .map((c) => `dlg-${c}`)
    .join(" ");

  return (
    <div className={`overlay ${overlayClassName}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog-wrap ${wrapClass}`}>
        <section className="dialog" role={role} aria-modal="true" aria-labelledby={id}>
          <img className="dialog__plaque" src={`${BASE}ui/header.webp`} alt="" draggable={false} />
          <h2 id={id} className="dialog__title">
            {title}
          </h2>
          {!hideClose && (
            <button ref={closeRef} type="button" className="dialog__close" onClick={onClose} aria-label="Close" data-sfx="none">
              <img src={`${BASE}ui/close.webp`} alt="" draggable={false} />
            </button>
          )}
          <div className={`dialog__body ${bodyClassName}`}>{children}</div>
          {footer && <footer className="dialog__foot">{footer}</footer>}
        </section>
      </div>
    </div>
  );
}
