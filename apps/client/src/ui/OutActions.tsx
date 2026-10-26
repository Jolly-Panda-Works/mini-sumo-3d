import { roomManager } from "../network/RoomManager";
import { KeyCap, useHotkey, useKeyboardUi } from "./Hotkey";

const BASE = import.meta.env.BASE_URL;

/**
 * Shown instead of the joystick and dash button once you've been pushed out: a note on the
 * plank label, and HOME (the same art button as the results board). Keyboard: H.
 */
export function OutActions() {
  const keyboard = useKeyboardUi();
  const goHome = () => void roomManager.leave();
  useHotkey(["KeyH"], goHome);
  return (
    <div className="out-actions">
      <p className="plank-label out-actions__note" role="status">
        You're out! Watching the rest of the bout
      </p>
      <button type="button" className="art art--out-home" onClick={goHome} aria-label="Return home" aria-keyshortcuts="H">
        <img src={`${BASE}ui/btn-home.webp`} alt="" width={360} height={114} draggable={false} />
        {keyboard && <KeyCap>H</KeyCap>}
      </button>
    </div>
  );
}
