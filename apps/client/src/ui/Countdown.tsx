import { useEffect, useRef, useState } from "react";
import { Phase } from "@mini-sumo/shared";
import { gameStore } from "../network/RoomManager";
import { useStore } from "../store";

/** Big 3, 2, 1, GO driven by the server's remaining countdown time. */
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
