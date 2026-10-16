import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import { audio } from "../audio/AudioManager";

/**
 * Shared popup: a sticky header with the title and a close (×) button in the top-right
 * corner, a scrolling body underneath, and an optional sticky footer.
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
}) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    audio.sample("menu-open");
    return () => audio.sample("menu-close");
  }, []);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`panel dialog ${className}`} role={role} aria-modal="true" aria-labelledby={id}>
        <header className="dialog__head">
          <h2 id={id} className="dialog__title">
            {title}
          </h2>
          {!hideClose && (
            <button ref={closeRef} type="button" className="dialog__close" onClick={onClose} aria-label="Close" data-sfx="none">
              <Icon name="close" size={26} />
            </button>
          )}
        </header>
        <div className={`dialog__body ${bodyClassName}`}>{children}</div>
        {footer && <footer className="dialog__foot">{footer}</footer>}
      </section>
    </div>
  );
}
