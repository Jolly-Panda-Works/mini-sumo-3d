import { roomManager } from "../network/RoomManager";

const BASE = import.meta.env.BASE_URL;

/**
 * Shown instead of the joystick and dash button once you've been pushed out: a note on the
 * plank label, and HOME (the same art button as the results board).
 */
export function OutActions() {
  return (
    <div className="out-actions">
      <p className="plank-label out-actions__note" role="status">
        You're out! Watching the rest of the bout
      </p>
      <button type="button" className="art art--out-home" onClick={() => void roomManager.leave()} aria-label="Return home">
        <img src={`${BASE}ui/btn-home.webp`} alt="" width={360} height={114} draggable={false} />
      </button>
    </div>
  );
}
