import type { FriendProfile, FriendsResponse, GameInvite } from "@mini-sumo/shared";
import { createStore } from "../store";
import { economyStore, request } from "./economyClient";
import { networkStore } from "./networkMode";

/** Friends and game invites (online only; the server keeps them). */
export interface FriendsState {
  data: FriendsResponse | null;
  loading: boolean;
  error: string | null;
}

export const friendsStore = createStore<FriendsState>({ data: null, loading: false, error: null });

/** Friends need the game server (and an account on it). */
export const friendsAvailable = (): boolean => networkStore.get().mode === "online" && economyStore.get().status === "ready";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

async function run(fn: () => Promise<FriendsResponse>, fallback: string): Promise<void> {
  friendsStore.update({ loading: true, error: null });
  try {
    friendsStore.update({ data: await fn(), loading: false });
  } catch (error) {
    friendsStore.update({ loading: false, error: message(error, fallback) });
    throw error;
  }
}

export const loadFriends = () => run(() => request<FriendsResponse>("/friends"), "Couldn't load your friends.");

export const addFriend = (code: string) =>
  run(() => request<FriendsResponse>("/friends/request", { method: "POST", body: JSON.stringify({ code }) }), "Couldn't send the request.");

/** A friend request to someone from a bout (bots included). */
export const addFriendById = (accountId: string) =>
  run(() => request<FriendsResponse>("/friends/request", { method: "POST", body: JSON.stringify({ accountId }) }), "Couldn't send the request.");

export const answerFriend = (accountId: string, accept: boolean) =>
  run(() => request<FriendsResponse>("/friends/respond", { method: "POST", body: JSON.stringify({ accountId, accept }) }), "Couldn't answer the request.");

export const removeFriend = (accountId: string) =>
  run(() => request<FriendsResponse>("/friends/remove", { method: "POST", body: JSON.stringify({ accountId }) }), "Couldn't remove the friend.");

export const friendProfile = (accountId: string) => request<FriendProfile>(`/friends/profile?id=${encodeURIComponent(accountId)}`);

export const inviteFriend = (accountId: string, roomId: string) =>
  request<GameInvite>("/invites", { method: "POST", body: JSON.stringify({ accountId, roomId }) });

export const fetchInvites = () => request<{ invites: GameInvite[] }>("/invites").then((r) => r.invites);

export const dismissInvite = (id: string) => request("/invites/dismiss", { method: "POST", body: JSON.stringify({ id }) }).catch(() => undefined);
