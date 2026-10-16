import { gameStore, roomManager } from "../network/RoomManager";
import { useStore } from "../store";
import { economyStore } from "../network/economyClient";
import { Coins } from "./Coins";
import { Dialog } from "./Dialog";
import { Icon, type IconName } from "./Icon";
import { settingsStore } from "../settings";
import { PlayerBadge } from "./PlayerBadge";

const MEDALS: Record<number, string> = { 1: "gold", 2: "silver", 3: "bronze" };

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
  let headline = "It's a draw!";
  if (winner) headline = winner.isYou ? "You win!" : `${winner.name} wins!`;

  return (
    <Dialog title={headline} onClose={() => undefined} hideClose className="results">
        <p className="field__label results__round">Round {game.round}</p>
        {!winner && <p className="hint hint--center">Nobody kept the ring on their own this time.</p>}

        <ol className="standings">
          {standings.map((p) => (
            <li key={p.id} className={`standings__row${p.isYou ? " standings__row--you" : ""}`}>
              {MEDALS[p.placement] ? (
                <Icon name={`medal-${MEDALS[p.placement]}` as IconName} size={40} className="standings__medal" label={`Place ${p.placement}`} />
              ) : (
                <span className="place" aria-label={`Place ${p.placement}`}>
                  {p.placement}
                </span>
              )}
              <PlayerBadge colorIndex={p.colorIndex} />
              <span className="standings__name">{p.isYou ? `${p.name} (you)` : p.name}</span>
              <span className="standings__note">
                {!p.connected ? "Left" : p.alive ? "In the ring" : p.elimReason === "left" ? "Left" : "Pushed out"}
              </span>
            </li>
          ))}
        </ol>

        {result && (result.kind !== "rewarded" || result.rewards > 0 || (result.xp ?? 0) > 0) && (
          <div className="economy-result reward-board" role="status">
            {won > 0 && (
              <div className="reward-panel">
                <span className="reward-panel__label">{result.prize > 0 ? "Prize" : "Reward"}</span>
                <span className="reward-panel__amount">
                  <Coins amount={won} signed />
                </span>
              </div>
            )}
            {paid && (
              <p>
                <span>Entry fee</span>
                <Coins amount={-result.entryFee} signed />
              </p>
            )}
            {result.prize > 0 && (result.rewards > 0 || (result.levelReward ?? 0) > 0) && (
              <p>
                <span>Prize</span>
                <Coins amount={result.prize} signed />
              </p>
            )}
            {result.economyFee > 0 && (
              <p className="hint">
                <span>Economy fee kept from the pool</span>
                <Coins amount={result.economyFee} />
              </p>
            )}
            {result.rewards > 0 && (
              <p>
                <span>Bout reward</span>
                <Coins amount={result.rewards} signed />
              </p>
            )}
            {result.xp !== undefined && result.xp > 0 && (
              <p>
                <span>XP</span>
                <strong>+{result.xp}</strong>
              </p>
            )}
            {result.levelReward !== undefined && result.levelReward > 0 && (
              <p>
                <span>Level-up reward</span>
                <Coins amount={result.levelReward} signed />
              </p>
            )}
            {result.levelUp && (
              <p className="economy-result__levelup">
                <Icon name="arrow-up" size={22} /> Level up! You're now level {result.level}.
              </p>
            )}
            {result.note && <p className="hint">{result.note}</p>}
            {result.balance !== null && (
              <p className="economy-result__balance">
                <span>Balance</span>
                <Coins amount={result.balance} />
              </p>
            )}
          </div>
        )}

        {paid ? (
          <>
            <div className="row">
<button className="art-btn art-btn--home" onClick={() => void roomManager.leave()} aria-label="Home">
                <img src={`${import.meta.env.BASE_URL}ui/btn-home.webp`} alt="" width={318} height={109} draggable={false} />
              </button>
              <button
                className="art-btn art-btn--again"
                onClick={() => {
                  const arenaId = game.arenaId;
                  void roomManager.leave().then(() => roomManager.enterArena(arenaId, settingsStore.get().name));
                }}
                aria-label={`Play again for ${arena?.entryFee ?? 0} Sumo Coins`}
              >
                <img src={`${import.meta.env.BASE_URL}ui/btn-play-again.webp`} alt="" width={288} height={102} draggable={false} />
                <span className="art-btn__fee">
                  <Coins amount={arena?.entryFee ?? 0} />
                </span>
              </button>
            </div>
            <p className="hint hint--center">Back home in {seconds}s.</p>
          </>
        ) : isHost ? (
          <div className="row">
            <button className="art-btn art-btn--again" onClick={() => roomManager.rematch()} aria-label="Rematch">
              <img src={`${import.meta.env.BASE_URL}ui/btn-rematch.webp`} alt="" width={289} height={102} draggable={false} />
            </button>
<button className="art-btn art-btn--home" onClick={() => void roomManager.leave()} aria-label="Home">
                <img src={`${import.meta.env.BASE_URL}ui/btn-home.webp`} alt="" width={318} height={109} draggable={false} />
              </button>
          </div>
        ) : (
          <p className="hint hint--center">Waiting for the host. Back to the lobby in {seconds}s.</p>
        )}
    </Dialog>
  );
}
