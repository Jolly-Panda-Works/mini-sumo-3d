/**
 * Where players are right now (in memory): the room they're in and whether a bout is on.
 * Rooms keep it up to date; the friends list uses it to say "In match" / "In lobby".
 */
export interface Activity {
  roomId: string;
  inMatch: boolean;
}

const activity = new Map<string, Activity>();

export const presence = {
  set(accountId: string, value: Activity): void {
    const current = activity.get(accountId);
    if (!current || current.roomId !== value.roomId || current.inMatch !== value.inMatch) activity.set(accountId, value);
  },
  /** Clears it only if the account is still recorded in that room. */
  clear(accountId: string, roomId: string): void {
    if (activity.get(accountId)?.roomId === roomId) activity.delete(accountId);
  },
  get(accountId: string): Activity | undefined {
    return activity.get(accountId);
  },
};
