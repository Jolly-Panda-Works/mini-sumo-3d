import { useEffect, useState } from "react";
import type { FriendProfile } from "@mini-sumo/shared";
import { friendProfile, removeFriend } from "../network/friendsClient";
import { showWarning } from "../uiStore";
import { avatarSrc } from "./Avatar";
import { Dialog } from "./Dialog";
import { WrestlerPreview } from "./WrestlerPreview";
import { sanitizeAppearance } from "@mini-sumo/shared";
import { PlayButton } from "./FriendsPanel";

/** A friend's profile: picture, name, level, bouts and wins; play or remove. */
export function FriendProfilePopup({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void friendProfile(accountId)
      .then(setProfile)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the profile."));
  }, [accountId]);

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
          <PlayButton friend={profile} />
          <button className="art art--remove-friend friend-profile__remove" onClick={() => void remove()} aria-label="Remove friend">
            <img src={`${import.meta.env.BASE_URL}ui/btn-remove-friend.webp`} alt="" draggable={false} />
          </button>
        </div>
      )}
    </Dialog>
  );
}
