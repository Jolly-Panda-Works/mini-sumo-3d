import { roomManager } from "../network/RoomManager";

/** Shown instead of the joystick and dash button once you've been pushed out. */
export function OutActions() {
  return (
    <div className="out-actions">
      <button className="btn btn--primary btn--big" onClick={() => void roomManager.leave()}>
        Return home
      </button>
    </div>
  );
}
