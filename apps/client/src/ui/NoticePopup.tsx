import { useEffect } from "react";
import { audio } from "../audio/AudioManager";
import { useStore } from "../store";
import { uiStore, type Notice } from "../uiStore";

const BASE = import.meta.env.BASE_URL;

/** Actions drawn with their own button art (by id, or id:label). */
const ART: Record<string, string> = {
  ok: "btn-ok",
  leave: "btn-leave",
  "cancel:stay": "btn-stay",
};

/**
 * Message / warning / error popup (public/ui/popup-<kind>.webp): the kind's plaque on top,
 * the title in the upper box, the message and the buttons in the lower box.
 * Shows the first notice in the queue; the next one follows when it's answered.
 */
export function NoticePopup() {
  const ui = useStore(uiStore);
  const notice = ui.notices[0];
  if (!notice) return null;
  return <NoticeView key={notice.id} notice={notice} />;
}

function NoticeView({ notice }: { notice: Notice }) {
  useEffect(() => {
    audio.sample(notice.kind === "message" ? "menu-open" : "reject");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        notice.resolve(notice.actions.some((a) => a.id === "cancel") ? "cancel" : "close");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [notice]);

  const actions = [...notice.actions].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
  return (
    <div className="overlay overlay--notice">
      <section
        className={`notice-popup notice-popup--${notice.kind}`}
        style={{ backgroundImage: `url("${BASE}ui/popup-${notice.kind}.webp")` }}
        role={notice.kind === "message" ? "dialog" : "alertdialog"}
        aria-modal="true"
        aria-label={`${notice.kind}: ${notice.title}`}
      >
        <h2 className="notice-popup__title">{notice.title}</h2>
        <div className="notice-popup__body">
          <p className="notice-popup__message">{notice.message}</p>
          <div className="notice-popup__actions">
            {actions.map((action, i) => {
              const art = ART[`${action.id}:${action.label}`.toLowerCase()] ?? ART[action.id];
              return art ? (
                <button
                  key={action.id}
                  type="button"
                  className="art art--notice"
                  onClick={() => notice.resolve(action.id)}
                  autoFocus={i === 0}
                  aria-label={action.label}
                >
                  <img src={`${BASE}ui/${art}.webp`} alt="" draggable={false} />
                </button>
              ) : (
                <button
                  key={action.id}
                  type="button"
                  className={`plank-btn${action.primary ? " plank-btn--primary" : ""}`}
                  onClick={() => notice.resolve(action.id)}
                  autoFocus={i === 0}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
