import { useEffect, useRef, useState } from "react";
import { COUNTDOWN_MS, Phase } from "@mini-sumo/shared";
import { gameStore } from "../network/RoomManager";
import { useStore } from "../store";

/** Walk-in, then a big 3, 2, 1 and GO (with the referee's whistle), driven by the server's clock. */
export function Countdown() {
  const game = useStore(gameStore);
  const [showGo, setShowGo] = useState(false);
  const prevPhase = useRef(game.phase);

  useEffect(() => {
    if (prevPhase.current === Phase.Countdown && game.phase === Phase.Playing) {
      setShowGo(true);
      const id = window.setTimeout(() => setShowGo(false), 850);
      prevPhase.current = game.phase;
      return () => window.clearTimeout(id);
    }
    prevPhase.current = game.phase;
    return undefined;
  }, [game.phase]);

  if (game.phase === Phase.Countdown) {
    // First the wrestlers walk in from the ring side; the numbers come after.
    if (game.remainingMs > COUNTDOWN_MS) return null;
    const n = Math.max(1, Math.ceil(game.remainingMs / 1000));
    return (
      <div className="countdown" aria-live="assertive">
        <span key={n} className="countdown__num">
          {n}
        </span>
      </div>
    );
  }
  if (showGo) {
    return (
      <div className="countdown" aria-live="assertive">
        <span className="countdown__num countdown__num--go">GO!</span>
      </div>
    );
  }
  return null;
}
