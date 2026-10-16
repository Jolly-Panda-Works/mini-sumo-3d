import { useEffect, useId, useRef, type ReactNode } from "react";

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
}: {
  title: ReactNode;
  onClose: () => void;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
  role?: "dialog" | "alertdialog";
  bodyClassName?: string;
}) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`panel dialog ${className}`} role={role} aria-modal="true" aria-labelledby={id}>
        <header className="dialog__head">
          <h2 id={id} className="dialog__title">
            {title}
          </h2>
          <button ref={closeRef} type="button" className="dialog__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className={`dialog__body ${bodyClassName}`}>{children}</div>
        {footer && <footer className="dialog__foot">{footer}</footer>}
      </section>
    </div>
  );
}
