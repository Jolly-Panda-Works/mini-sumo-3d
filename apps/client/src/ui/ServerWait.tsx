import { networkStore } from "../network/networkMode";
import { sessionStore } from "../network/RoomManager";
import { useStore } from "../store";

const BASE = import.meta.env.BASE_URL;

/**
 * Shown while the game waits for the server (checking it at start, or joining an online
 * room): the home background with the running sumo, no progress bar.
 */
export function ServerWait() {
  const network = useStore(networkStore);
  const session = useStore(sessionStore);
  const waiting = network.mode === "checking" || (network.mode === "online" && session.status === "connecting");
  if (!waiting) return null;
  return (
    <div className="server-wait" role="status" aria-label="Connecting to the server">
      <div className="server-wait__runner" aria-hidden="true">
        <img src={`${BASE}boot/run.webp`} alt="" draggable={false} />
      </div>
      <p className="server-wait__text">Connecting…</p>
    </div>
  );
}
