import { describe, expect, it } from "vitest";
import { AccountRecovery, normalizeEmail } from "../src/account/Recovery.js";
import type { Mailer, VerificationEmail } from "../src/account/mailer.js";
import { EmailJsMailer } from "../src/account/mailer.js";
import { Economy } from "../src/economy/Economy.js";
import { silentEventSink } from "../src/economy/events.js";

/** The error message of a failing promise ("" when it succeeds). */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The error message of a failing call ("" when it succeeds). */
function thrown(fn: () => unknown): string {
  try {
    fn();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const FLAGS = { economy: true, shop: true, premiumCurrency: false, realMoneyPurchases: false };

function setup() {
  let now = Date.parse("2026-10-19T10:00:00Z");
  const economy = new Economy(":memory:", FLAGS, silentEventSink, () => new Date(now), false);
  const sent: VerificationEmail[] = [];
  const mailer: Mailer = { send: async (email) => void sent.push(email) };
  const recovery = new AccountRecovery(economy, mailer, "https://sumo.ryujin.fans/", () => now);
  return { economy, recovery, sent, advance: (ms: number) => (now += ms) };
}

describe("saving progress with an email", () => {
  it("links an email with the emailed code", async () => {
    const { economy, recovery, sent } = setup();
    const { accountId } = economy.createGuest();
    await recovery.startLink(accountId, " Usef@Example.com ", "en");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "usef@example.com", purpose: "link", lang: "en" });
    expect(/^\d{6}$/.test(sent[0]!.code)).toBe(true);
    expect(sent[0]!.link.includes("code=" + sent[0]!.code)).toBe(true);
    expect(recovery.verifyLink(accountId, "usef@example.com", sent[0]!.code)).toEqual({ email: "usef@example.com" });
    expect(recovery.linkedEmail(accountId)).toBe("usef@example.com");
  });

  it("restores the same account on a new device; both devices keep working", async () => {
    const { economy, recovery, sent } = setup();
    const first = economy.createGuest();
    await recovery.startLink(first.accountId, "usef@example.com", "fa");
    recovery.verifyLink(first.accountId, "usef@example.com", sent[0]!.code);
    await recovery.startRestore("usef@example.com", "fa");
    expect(sent[1]).toMatchObject({ purpose: "restore", lang: "fa" });
    const restored = recovery.verifyRestore("usef@example.com", sent[1]!.code);
    expect(restored.accountId).toBe(first.accountId);
    expect(economy.authenticate(restored.token)).toBe(first.accountId);
    expect(economy.authenticate(first.token)).toBe(first.accountId);
  });

  it("says nothing about emails without an account (and sends nothing)", async () => {
    const { recovery, sent } = setup();
    expect(await failure(recovery.startRestore("nobody@example.com", "en"))).toBe("");
    expect(sent).toHaveLength(0);
  });

  it("refuses wrong codes, then locks after 5 tries; codes are single-use and expire", async () => {
    const { economy, recovery, sent, advance } = setup();
    const { accountId } = economy.createGuest();
    await recovery.startLink(accountId, "a@example.com", "en");
    for (let i = 0; i < 5; i++) expect(thrown(() => recovery.verifyLink(accountId, "a@example.com", "000000")).includes("isn't right")).toBe(true);
    expect(thrown(() => recovery.verifyLink(accountId, "a@example.com", sent[0]!.code)).includes("Too many")).toBe(true);
    advance(61_000);
    await recovery.startLink(accountId, "a@example.com", "en");
    advance(16 * 60_000);
    expect(thrown(() => recovery.verifyLink(accountId, "a@example.com", sent[1]!.code)).includes("expired")).toBe(true);
  });

  it("one email per account: another player's email can't be linked", async () => {
    const { economy, recovery, sent } = setup();
    const a = economy.createGuest();
    const b = economy.createGuest();
    await recovery.startLink(a.accountId, "shared@example.com", "en");
    recovery.verifyLink(a.accountId, "shared@example.com", sent[0]!.code);
    expect((await failure(recovery.startLink(b.accountId, "shared@example.com", "en"))).includes("another player")).toBe(true);
  });

  it("waits a minute between codes", async () => {
    const { economy, recovery, advance } = setup();
    const { accountId } = economy.createGuest();
    await recovery.startLink(accountId, "a@example.com", "en");
    expect((await failure(recovery.startLink(accountId, "a@example.com", "en"))).includes("Wait a minute")).toBe(true);
    advance(61_000);
    expect(await failure(recovery.startLink(accountId, "a@example.com", "en"))).toBe("");
  });

  it("checks email addresses", () => {
    expect(normalizeEmail("A@B.co")).toBe("a@b.co");
    expect(normalizeEmail("not an email")).toBe(null);
    expect(normalizeEmail("a@b")).toBe(null);
  });

  it("sends the finished email into the studio's generic EmailJS template", async () => {
    let body: Record<string, unknown> = {};
    const mailer = new EmailJsMailer(
      { serviceId: "svc", templateId: "tpl", publicKey: "pub", privateKey: "priv", replyTo: "hi@jollypanda.ir", publicUrl: "https://sumo.ryujin.fans/" },
      async (_url, init) => {
        body = JSON.parse(init.body) as Record<string, unknown>;
        return { ok: true, status: 200, text: async () => "OK" };
      },
    );
    await mailer.send({ to: "a@example.com", name: "<b>Usef</b>", code: "123456", link: "https://x/?code=123456&email=a", purpose: "restore", lang: "fa", minutes: 15 });
    expect(body).toMatchObject({ service_id: "svc", template_id: "tpl", user_id: "pub", accessToken: "priv" });
    const params = body.template_params as Record<string, string>;
    expect(params.to_email).toBe("a@example.com");
    expect(params.from_name).toBe("Jolly Panda Studio");
    expect(params.reply_to).toBe("hi@jollypanda.ir");
    expect(params.email_subject.length > 0).toBe(true);
    // The Persian design, the code, the logo; the player's name escaped; no placeholders left
    expect(params.html.includes('dir="rtl"')).toBe(true);
    expect(params.html.includes("123456")).toBe(true);
    expect(params.html.includes("https://sumo.ryujin.fans/email/jolly-panda-logo.png")).toBe(true);
    expect(params.html.includes("&lt;b&gt;Usef&lt;/b&gt;")).toBe(true);
    expect(params.html.includes("<b>Usef</b>")).toBe(false);
    expect(params.html.includes("&amp;email=a")).toBe(true);
    expect(/\{\{\w+\}\}/.test(params.html)).toBe(false);
  });
});
