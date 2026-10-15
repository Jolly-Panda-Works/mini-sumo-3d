import { PLAYER_COLORS } from "@mini-sumo/shared";
import { gameStore, roomManager } from "../network/RoomManager";
import { useStore } from "../store";
import { PlayerBadge } from "./PlayerBadge";

function ordinal(n: number): string {
  return ["", "1st", "2nd", "3rd", "4th"][n] ?? `${n}th`;
}

export function Results() {
  const game = useStore(gameStore);
  const you = game.players.find((p) => p.isYou);
  const isHost = Boolean(you?.isHost);
  const winner = game.players.find((p) => p.id === game.winnerId);
  const byId = new Map(game.players.map((p) => [p.id, p]));
  const standings = game.standings.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const seconds = Math.ceil(game.remainingMs / 1000);

  let headline = "It's a draw!";
  if (winner) headline = winner.isYou ? "You win!" : `${winner.name} wins!`;

  return (
    <div className="overlay">
      <section className="panel results" aria-label="Round results" aria-live="polite">
        <p className="field__label">Round {game.round}</p>
        <h2
          className="results__headline"
          style={winner ? { textDecorationColor: PLAYER_COLORS[winner.colorIndex % PLAYER_COLORS.length]!.hex } : undefined}
        >
          {headline}
        </h2>
        {!winner && <p className="hint hint--center">Nobody kept the ring on their own this time.</p>}

        <ol className="standings">
          {standings.map((p) => (
            <li key={p.id} className={`standings__row${p.isYou ? " standings__row--you" : ""}`}>
              <span className="standings__place">{ordinal(p.placement)}</span>
              <PlayerBadge colorIndex={p.colorIndex} />
              <span className="standings__name">{p.isYou ? `${p.name} (you)` : p.name}</span>
              <span className="standings__note">
                {!p.connected ? "Left" : p.alive ? "In the ring" : p.elimReason === "left" ? "Left" : "Pushed out"}
              </span>
            </li>
          ))}
        </ol>

        {isHost ? (
          <div className="row">
            <button className="btn btn--primary btn--grow" onClick={() => roomManager.rematch()}>
              Rematch
            </button>
            <button className="btn btn--grow" onClick={() => roomManager.returnToLobby()}>
              Back to lobby
            </button>
          </div>
        ) : (
          <p className="hint hint--center">Waiting for the host. Back to the lobby in {seconds}s.</p>
        )}
        <button className="btn btn--ghost" onClick={() => void roomManager.leave()}>
          Leave room
        </button>
      </section>
    </div>
  );
}
