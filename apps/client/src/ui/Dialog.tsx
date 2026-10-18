import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { audio } from "../audio/AudioManager";

const BASE = import.meta.env.BASE_URL;

let layer: HTMLElement | null = null;
let stackLevel = 0;

/**
 * The stacking level for a popup that is opening: every new popup goes above all the ones
 * already open (whatever kind it is: panel, nested popup, warning, level up).
 */
export function nextStackLevel(): number {
  stackLevel += 1;
  return stackLevel;
}

/** Hook: this popup's level, fixed when it opens. */
export function useStackLevel(): number {
  const [level] = useState(nextStackLevel);
  return level;
}
/** One layer for all popups, at the end of <body>; later popups stack on earlier ones. */
export function popupLayer(): HTMLElement {
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "popup-layer";
    layer.className = "popup-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

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
  sub,
  variant = "main",
  aside,
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
  /** Fixed content right under the title (e.g. the coin balance); the body scrolls below it. */
  sub?: ReactNode;
  /**
   * "sub": the smaller frame (public/ui/popup-sub.webp) for a popup opened on top of
   * another one (About, buying an item, editing the name…).
   */
  variant?: "main" | "sub" | "welcome" | "board" | "editname";
  /** Content attached to the outside of the panel (main popups), e.g. side tabs. */
  aside?: ReactNode;
}) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const zIndex = useStackLevel();
  // Close with the closing animation (the × and a tap outside).
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 170);
  };

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

  const popup = (
    <div
      className={`overlay ${overlayClassName}${variant === "sub" ? " overlay--sub" : ""}${closing ? " overlay--closing" : ""}`}
      style={{ zIndex }}
      onClick={(e) => e.target === e.currentTarget && requestClose()}
    >
      {variant === "board" ? (
        <div className={`dialog-wrap dialog-wrap--board ${wrapClass}`}>
          <section className="board-dialog" role={role} aria-modal="true" aria-labelledby={id}>
            <h2 id={id} className="visually-hidden">
              {title}
            </h2>
            {!hideClose && (
              <button ref={closeRef} type="button" className="board-dialog__close" onClick={requestClose} aria-label="Close" data-sfx="none">
                <img src={`${BASE}ui/close.webp`} alt="" draggable={false} />
              </button>
            )}
            <div className={`board-dialog__body ${bodyClassName}`}>{children}</div>
          </section>
        </div>
      ) : variant === "editname" ? (
        <div className={`dialog-wrap dialog-wrap--editname ${wrapClass}`}>
          <section className="editname-dialog" role={role} aria-modal="true" aria-labelledby={id}>
            <h2 id={id} className="visually-hidden">
              {title}
            </h2>
            {!hideClose && (
              <button ref={closeRef} type="button" className="editname-dialog__close" onClick={requestClose} aria-label="Close" data-sfx="none">
                <img src={`${BASE}ui/close.webp`} alt="" draggable={false} />
              </button>
            )}
            <div className={`editname-dialog__inner ${bodyClassName}`}>{children}</div>
          </section>
        </div>
      ) : variant === "welcome" ? (
        <div className={`dialog-wrap dialog-wrap--welcome ${wrapClass}`}>
          <section className="welcome-dialog" role={role} aria-modal="true" aria-labelledby={id}>
            <h2 id={id} className="visually-hidden">
              {title}
            </h2>
            <div className={`welcome-dialog__inner ${bodyClassName}`}>{children}</div>
          </section>
        </div>
      ) : variant === "sub" ? (
        <div className={`dialog-wrap dialog-wrap--sub ${wrapClass}`}>
          <section className="sub-dialog" role={role} aria-modal="true" aria-labelledby={id}>
            <h2 id={id} className="sub-dialog__title">
              {title}
            </h2>
            {!hideClose && (
              <button ref={closeRef} type="button" className="sub-dialog__close" onClick={requestClose} aria-label="Close" data-sfx="none">
                <img src={`${BASE}ui/close.webp`} alt="" draggable={false} />
              </button>
            )}
            <div className="sub-dialog__inner">
              {sub && <div className="sub-dialog__sub">{sub}</div>}
              <div className={`sub-dialog__body ${bodyClassName}`}>{children}</div>
              {footer && <footer className="sub-dialog__foot">{footer}</footer>}
            </div>
          </section>
        </div>
      ) : (
      <div className={`dialog-wrap ${wrapClass}`}>
        <section className="dialog" role={role} aria-modal="true" aria-labelledby={id}>
          {aside && <div className="dialog__aside">{aside}</div>}
          <img className="dialog__plaque" src={`${BASE}ui/header.webp`} alt="" draggable={false} />
          <h2 id={id} className="dialog__title">
            {title}
          </h2>
          {!hideClose && (
            <button ref={closeRef} type="button" className="dialog__close" onClick={requestClose} aria-label="Close" data-sfx="none">
              <img src={`${BASE}ui/close.webp`} alt="" draggable={false} />
            </button>
          )}
          {sub && <div className="dialog__sub">{sub}</div>}
          <div className={`dialog__body ${bodyClassName}${sub ? " dialog__body--below-sub" : ""}`}>{children}</div>
          {footer && <footer className="dialog__foot">{footer}</footer>}
        </section>
      </div>
      )}
    </div>
  );
  // In the top-level popup layer, so a popup opened from another one sits on top of it
  // instead of inside it.
  return createPortal(popup, popupLayer());
}
