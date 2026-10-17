import { useEffect } from "react";
import { gameStore, roomManager } from "../network/RoomManager";
import { useStore } from "../store";
import { economyStore } from "../network/economyClient";
import { settingsStore } from "../settings";
import { audio } from "../audio/AudioManager";
import { avatarSrc } from "./Avatar";

const BASE = import.meta.env.BASE_URL;

/**
 * Results in the scoreboard frame (public/ui/results-board.webp): the headline on the top
 * plaque, the four places, the coins won in the prize panel and the buttons in the dark
 * area at the bottom. Positions are measured from the art.
 */
export function Results() {
  const game = useStore(gameStore);
  const you = game.players.find((p) => p.isYou);
  const isHost = Boolean(you?.isHost);
  const economy = useStore(economyStore);
  const result = economy.lastResult;
  const arena = economy.catalog?.arenas.find((a) => a.id === game.arenaId);
  const paid = (arena?.entryFee ?? 0) > 0;
  const winner = game.players.find((p) => p.id === game.winnerId);
  const byId = new Map(game.players.map((p) => [p.id, p]));
  const standings = game.standings.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const seconds = Math.ceil(game.remainingMs / 1000);
  const won = result ? result.prize + result.rewards + (result.levelReward ?? 0) : 0;
  const lost = paid && result && won === 0 && result.kind === "settled" ? result.entryFee : 0;

  let headline = "It's a draw!";
  if (winner) headline = winner.isYou ? "You win!" : `${winner.name} wins!`;

  useEffect(() => {
    audio.sample("menu-open");
  }, []);

  const playAgain = () => {
    const arenaId = game.arenaId;
    void roomManager.leave().then(() => roomManager.enterArena(arenaId, settingsStore.get().name));
  };

  return (
    <div className="overlay">
      <section className="results-board" aria-label="Round results" aria-live="polite">
        <h2 className="results-board__title">{headline}</h2>

        {[0, 1, 2, 3].map((i) => {
          const p = standings[i];
          return (
            <div key={i} className={`results-board__row${p?.isYou ? " results-board__row--you" : ""}`} style={{ top: `${ROWS[i]}%` }}>
              {p && (
                <>
                  <img className="results-board__avatar" src={avatarSrc(p.appearance.avatar)} alt="" width={160} height={160} />
                  <span className="results-board__name">{p.isYou ? `${p.name} (you)` : p.name}</span>
                  <span className="results-board__note">
                    {!p.connected || p.elimReason === "left" ? "Left" : p.alive ? "In the ring" : "Out"}
                  </span>
                </>
              )}
            </div>
          );
        })}

        <div className="results-board__rewards">
          <div className="reward-frame reward-frame--coin" aria-label={won > 0 ? `You won ${won} Sumo Coins` : "No coins this time"}>
            <span className="reward-frame__value">{won > 0 ? `+${won.toLocaleString("en-US")}` : lost > 0 ? `-${lost.toLocaleString("en-US")}` : "0"}</span>
          </div>
          <div className="reward-frame reward-frame--xp" aria-label={`${result?.xp ?? 0} XP`}>
            <span className="reward-frame__value">+{result?.xp ?? 0}</span>
          </div>
        </div>

        <div className="results-board__bottom">
          <div className="results-board__buttons">
            <button className="art-btn" onClick={() => void roomManager.leave()} aria-label="Home">
              <img src={`${BASE}ui/btn-home.webp`} alt="" width={307} height={113} draggable={false} />
            </button>
            {paid ? (
              <button className="art-btn" onClick={playAgain} aria-label={`Play again for ${arena?.entryFee ?? 0} Sumo Coins`}>
                <img src={`${BASE}ui/btn-play-again.webp`} alt="" width={307} height={113} draggable={false} />
              </button>
            ) : isHost ? (
              <button className="art-btn" onClick={() => roomManager.rematch()} aria-label="Rematch">
                <img src={`${BASE}ui/btn-rematch.webp`} alt="" width={281} height={94} draggable={false} />
              </button>
            ) : null}
          </div>
          <p className="results-board__info">
            {paid ? `Home in ${seconds}s` : !isHost ? `Lobby in ${seconds}s` : ""}
          </p>
        </div>
      </section>
    </div>
  );
}

/** Top of each place row on the board (% of its height). */
const ROWS = [19.4, 28.4, 37.7, 46.8];
