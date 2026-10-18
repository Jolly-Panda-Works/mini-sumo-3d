import { describe, expect, it } from "vitest";
import { Economy } from "../src/economy/Economy.js";
import { silentEventSink } from "../src/economy/events.js";
import { Friends } from "../src/social/Friends.js";

const FLAGS = { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false };

function setup() {
  let now = Date.parse("2026-10-18T10:00:00Z");
  const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date(now));
  const friends = new Friends(economy, () => now);
  const make = (name: string) => {
    const { accountId } = economy.createGuest();
    economy.syncProfile(accountId, { name, appearance: {}, xp: 0, matches: 0, wins: 0, updatedAt: "2026-10-18T09:00:00Z" });
    return accountId;
  };
  return { economy, friends, make, advance: (ms: number) => (now += ms) };
}

describe("friends", () => {
  it("adds a friend by code: request, then accept", () => {
    const { friends, make } = setup();
    const a = make("Usef");
    const b = make("Kenta");
    const sent = friends.request(a, friends.codeOf(b));
    expect(sent.outgoing.map((f) => f.name)).toEqual(["Kenta"]);
    expect(friends.list(b).incoming.map((f) => f.name)).toEqual(["Usef"]);
    friends.respond(b, a, true);
    expect(friends.list(a).friends.map((f) => f.name)).toEqual(["Kenta"]);
    expect(friends.areFriends(a, b)).toBe(true);
  });

  it("two requests the same way make friends right away; codes are case-insensitive", () => {
    const { friends, make } = setup();
    const a = make("A");
    const b = make("B");
    friends.request(a, friends.codeOf(b).toLowerCase());
    friends.request(b, friends.codeOf(a));
    expect(friends.areFriends(a, b)).toBe(true);
  });

  it("rejects bad codes and your own code", () => {
    const { friends, make } = setup();
    const a = make("A");
    expect(() => friends.request(a, "ZZZZZZ")).toThrow();
    expect(() => friends.request(a, friends.codeOf(a))).toThrow();
    expect(() => friends.request(a, "x")).toThrow();
  });

  it("declining or removing ends it; profiles only for friends and requests", () => {
    const { friends, make } = setup();
    const a = make("A");
    const b = make("B");
    const c = make("C");
    friends.request(a, friends.codeOf(b));
    expect(friends.profile(b, a).name).toBe("A");
    expect(friends.profile(b, a).appearance.hair).toBe(0);
    expect(() => friends.profile(c, a)).toThrow();
    friends.respond(b, a, false);
    expect(friends.list(a).outgoing).toHaveLength(0);
    friends.request(a, friends.codeOf(b));
    friends.respond(b, a, true);
    friends.remove(a, b);
    expect(friends.areFriends(a, b)).toBe(false);
  });

  it("presence: online after an API call, offline a minute later", () => {
    const { friends, make, advance } = setup();
    const a = make("A");
    friends.touch(a);
    expect(friends.isOnline(a)).toBe(true);
    advance(61_000);
    expect(friends.isOnline(a)).toBe(false);
  });

  it("invites: only online friends; expire after two minutes; dismissable", () => {
    const { friends, make, advance } = setup();
    const a = make("Usef");
    const b = make("Kenta");
    const c = make("Mika");
    friends.request(a, friends.codeOf(b));
    friends.respond(b, a, true);
    expect(() => friends.invite(a, b, "room1")).toThrow(); // b offline
    friends.touch(b);
    const invite = friends.invite(a, b, "room1");
    expect(invite.from.name).toBe("Usef");
    expect(friends.pendingInvites(b).map((i) => i.roomId)).toEqual(["room1"]);
    friends.touch(c);
    expect(() => friends.invite(a, c, "room1")).toThrow(); // not friends
    friends.dismissInvite(b, invite.id);
    expect(friends.pendingInvites(b)).toHaveLength(0);
    friends.invite(a, b, "room2");
    advance(121_000);
    expect(friends.pendingInvites(b)).toHaveLength(0);
  });
});

describe("friends with bot players", () => {
  it("a bot accepts a request after a short while; requests by account work", () => {
    let now = Date.parse("2026-10-18T10:00:00Z");
    const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date(now));
    const friends = new Friends(economy, () => now);
    const { accountId: me } = economy.createGuest();
    const bot = economy.botAccounts()[0]!.id;
    friends.requestById(me, bot);
    expect(friends.list(me).outgoing.map((f) => f.accountId)).toEqual([bot]);
    now += 21_000;
    expect(friends.list(me).friends.map((f) => f.accountId)).toEqual([bot]);
  });

  it("inviting an online bot friend puts it into the room through the server hook", () => {
    let now = Date.parse("2026-10-18T10:00:00Z");
    const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date(now));
    const friends = new Friends(economy, () => now);
    const calls: string[] = [];
    friends.onBotInvite = (botId, roomId) => void calls.push(`${botId}@${roomId}`);
    const { accountId: me } = economy.createGuest();
    // A bot that is online this hour.
    const bot = economy.botAccounts().find((b) => friends.isOnline(b.id))!.id;
    friends.requestById(me, bot);
    now += 21_000;
    friends.list(me);
    friends.invite(me, bot, "room42");
    expect(calls).toEqual([`${bot}@room42`]);
  });
});

describe("public profiles", () => {
  it("anyone's profile can be opened, with how you're connected", () => {
    const now = Date.parse("2026-10-18T10:00:00Z");
    const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date(now), false);
    const friends = new Friends(economy, () => now);
    const { accountId: a } = economy.createGuest();
    const { accountId: b } = economy.createGuest();
    expect(friends.publicProfile(a, b).relation).toBe("none");
    expect(friends.publicProfile(a, a).relation).toBe("self");
    friends.requestById(a, b);
    expect(friends.publicProfile(a, b).relation).toBe("outgoing");
    expect(friends.publicProfile(b, a).relation).toBe("incoming");
    friends.respond(b, a, true);
    expect(friends.publicProfile(a, b).relation).toBe("friend");
    expect(() => friends.publicProfile(a, "nobody")).toThrow();
  });
});
