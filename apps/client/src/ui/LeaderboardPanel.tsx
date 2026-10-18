import { useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import type { LeaderboardEntry, LeaderboardResponse } from "@mini-sumo/shared";
import { request } from "../network/economyClient";
import { networkStore } from "../network/networkMode";
import { useStore } from "../store";
import { setLeaderboardOpen } from "../uiStore";
import { avatarSrc } from "./Avatar";
import { Dialog } from "./Dialog";
import { FriendProfilePopup } from "./FriendProfilePopup";

const BASE = import.meta.env.BASE_URL;
const MEDALS = ["gold", "silver", "bronze"] as const;

/**
 * Leaderboard: players ranked by total XP. Your own row is always in view: in place when it's
 * visible in the list, pinned to the bottom when it's further down (or you're outside the top
 * list), pinned to the top when you've scrolled past it.
 */
export function LeaderboardPanel() {
  const network = useStore(networkStore);
  const online = network.mode === "online";
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const meRef = useRef<HTMLLIElement>(null);
  const [pin, setPin] = useState<"none" | "top" | "bottom">("bottom");
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    if (!online) return;
    void request<LeaderboardResponse>("/leaderboard?limit=100")
      .then(setBoard)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the leaderboard."));
  }, [online]);

  const meInList = Boolean(board?.top.some((e) => e.accountId === board.you.accountId));

  // Where your row is relative to the visible part of the list.
  const updatePin = () => {
    const list = listRef.current;
    const me = meRef.current;
    if (!list || !me) {
      setPin("bottom");
      return;
    }
    const l = list.getBoundingClientRect();
    const m = me.getBoundingClientRect();
    if (m.top >= l.bottom - m.height / 2) setPin("bottom");
    else if (m.bottom <= l.top + m.height / 2) setPin("top");
    else setPin("none");
  };
  useLayoutEffect(updatePin, [board]);

  return (
    <Dialog title="Leaderboard" onClose={() => setLeaderboardOpen(false)} className="leaderboard" bodyClassName="leaderboard__body" variant="board">
      {!online ? (
        <p className="leaderboard__note">The leaderboard needs the game server. Connect to the internet and try again.</p>
      ) : error ? (
        <p className="leaderboard__note">{error}</p>
      ) : !board ? (
        <p className="leaderboard__note">Loading…</p>
      ) : (
        <>
          {pin === "top" && meInList && <Row entry={board.you} you pinned />}
          <ol className="leaderboard__list" ref={listRef} onScroll={updatePin}>
            {board.top.map((entry) => {
              const isMe = entry.accountId === board.you.accountId;
              return (
                <Row
                  key={entry.accountId}
                  entry={entry}
                  you={isMe}
                  rowRef={isMe ? meRef : undefined}
                  onOpen={isMe ? undefined : () => setViewing(entry.accountId)}
                />
              );
            })}
          </ol>
          {(pin === "bottom" || !meInList) && <Row entry={board.you} you pinned />}
        </>
      )}
      {viewing && <FriendProfilePopup accountId={viewing} isPublic onClose={() => setViewing(null)} />}
    </Dialog>
  );
}

function rankLabel(rank: number): string {
  if (rank >= 1_000_000) return `${Math.floor(rank / 1_000_000)}M+`;
  if (rank >= 1_000) return `${Math.floor(rank / 1_000)}K+`;
  return String(rank);
}

function Row({
  entry,
  you = false,
  pinned = false,
  rowRef,
  onOpen,
}: {
  entry: LeaderboardEntry;
  you?: boolean;
  pinned?: boolean;
  rowRef?: Ref<HTMLLIElement>;
  /** Open this player's profile. */
  onOpen?: () => void;
}) {
  const medal = MEDALS[entry.rank - 1];
  const content = (
    <>
      <span className="lb-row__rank" aria-label={`Rank ${entry.rank}`}>
        {medal ? <img src={`${BASE}icons/medal-${medal}.webp`} alt="" width={64} height={64} /> : <span className="lb-row__num">{rankLabel(entry.rank)}</span>}
      </span>
      <img className="lb-row__avatar" src={avatarSrc(entry.avatar)} alt="" width={160} height={160} loading="lazy" />
      <span className="lb-row__who">
        <strong>{you ? `${entry.name} (you)` : entry.name}</strong>
        <span>Lvl {entry.level}</span>
      </span>
      <span className="lb-row__score" aria-label={`${entry.xp} XP`}>
        <span className="lb-row__score-value">{entry.xp.toLocaleString("en-US")}</span>
      </span>
    </>
  );
  const className = `lb-row${you ? " lb-row--you" : ""}${pinned ? " lb-row--pinned" : ""}`;
  return pinned ? (
    <div className={className}>{content}</div>
  ) : (
    <li className={className} ref={rowRef}>
      {onOpen ? (
        <button type="button" className="lb-row__open" onClick={onOpen} aria-label={`${entry.name}'s profile, rank ${entry.rank}`}>
          {content}
        </button>
      ) : (
        content
      )}
    </li>
  );
}
