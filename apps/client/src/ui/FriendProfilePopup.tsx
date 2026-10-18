import { useEffect, useState } from "react";
import type { FriendProfile } from "@mini-sumo/shared";
import { addFriendById, answerFriend, friendProfile, playerProfile, removeFriend } from "../network/friendsClient";
import { pushToast, showError, showWarning } from "../uiStore";
import { avatarSrc } from "./Avatar";
import { Dialog } from "./Dialog";
import { WrestlerPreview } from "./WrestlerPreview";
import { sanitizeAppearance } from "@mini-sumo/shared";
import { PlayButton, SmallArt } from "./FriendsPanel";

/**
 * A player's profile: wrestler, picture, name, level, bouts and wins.
 * Friends: play or remove. Anyone else (opened from the leaderboard): add as a friend.
 */
export function FriendProfilePopup({ accountId, onClose, isPublic = false }: { accountId: string; onClose: () => void; isPublic?: boolean }) {
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (isPublic ? playerProfile(accountId) : friendProfile(accountId))
      .then(setProfile)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the profile."));
  }, [accountId, isPublic]);

  const add = async () => {
    if (!profile) return;
    try {
      await addFriendById(accountId);
      setProfile({ ...profile, relation: "outgoing" });
      pushToast(`Friend request sent to ${profile.name}`, "info");
    } catch (error) {
      void showError("Couldn't add friend", error instanceof Error ? error.message : "Try again.");
    }
  };
  const accept = async () => {
    if (!profile) return;
    try {
      await answerFriend(accountId, true);
      setProfile({ ...profile, relation: "friend" });
      pushToast(`${profile.name} is now your friend`, "info");
    } catch (error) {
      void showError("Couldn't accept", error instanceof Error ? error.message : "Try again.");
    }
  };
  // Profiles from the friends list are friends (or requests); public ones say so.
  const relation = profile?.relation ?? "friend";

  const remove = async () => {
    if (!profile) return;
    const choice = await showWarning("Remove friend?", `${profile.name} will be removed from your friends.`, [
      { id: "leave", label: "Remove", primary: true },
      { id: "cancel", label: "Not now" },
    ]);
    if (choice !== "leave") return;
    await removeFriend(accountId).catch(() => undefined);
    onClose();
  };

  return (
    <Dialog title={profile?.name ?? "Profile"} onClose={onClose} className="friend-profile" variant="sub">
      {error && <p className="hint hint--center">{error}</p>}
      {profile && (
        <div className="friend-profile__body">
          <div className="friend-profile__hero">
            <WrestlerPreview appearance={sanitizeAppearance(profile.appearance)} className="friend-profile__wrestler" />
            <img className="friend-profile__avatar" src={avatarSrc(profile.avatar)} alt="" width={160} height={160} />
          </div>
          <p className="friend-profile__name">{profile.name}</p>
          <p className="friend-profile__status">
            Level {profile.level} · {profile.online ? "Online" : "Offline"}
          </p>
          <dl className="friend-profile__stats">
            <div>
              <dt>Bouts</dt>
              <dd>{profile.matches}</dd>
            </div>
            <div>
              <dt>Wins</dt>
              <dd>{profile.wins}</dd>
            </div>
          </dl>
          {relation === "friend" && (
            <>
              <PlayButton friend={profile} />
              <button className="art art--remove-friend friend-profile__remove" onClick={() => void remove()} aria-label="Remove friend">
                <img src={`${import.meta.env.BASE_URL}ui/btn-remove-friend.webp`} alt="" draggable={false} />
              </button>
            </>
          )}
          {relation === "none" && (
            <button className="art art--add friend-profile__add" onClick={() => void add()} aria-label={`Add ${profile.name} as a friend`}>
              <img src={`${import.meta.env.BASE_URL}ui/btn-add.webp`} alt="" draggable={false} />
            </button>
          )}
          {relation === "outgoing" && <p className="friend-profile__note">Friend request sent · not accepted yet</p>}
          {relation === "incoming" && (
            <SmallArt art="btn-accept" label={`Accept ${profile.name}`} onClick={() => void accept()} />
          )}
          {relation === "self" && <p className="friend-profile__note">This is you</p>}
        </div>
      )}
    </Dialog>
  );
}
