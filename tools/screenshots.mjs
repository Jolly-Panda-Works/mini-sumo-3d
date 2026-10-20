// Screenshots of the whole game, for the README and docs/SCREENSHOTS.md.
//
// Part 1, a real local match (3 players, one on a phone): welcome, home, customise, waiting
//   room, countdown, bout and results (docs/screenshots/*.png, used by the README).
// Part 2, every other screen and popup, through dev mode's previews (sample data), on a
//   desktop and a phone screen (docs/screenshots/desktop/*.png, docs/screenshots/phone/*.png).
// Then docs/SCREENSHOTS.md is written: a gallery of everything.
//
// Requires the server on :2567 and the built client served on :4173 (see the Screenshots workflow).
//   npm install --no-save playwright && npx playwright install --with-deps chromium
//   node tools/screenshots.mjs [baseUrl] [outDir]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:4173/";
const OUT = process.argv[3] ?? "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`saved ${OUT}/${name}.png`);
};

const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
});

async function player(name, options = { viewport: { width: 1280, height: 720 } }) {
  const context = await browser.newContext({ ...options, colorScheme: "light" });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[${name}] page error:`, e.message));
  return { page, name };
}

// The studio card and loading screen play first; wait until they're gone.
async function bootDone(page) {
  await page.waitForSelector("#boot", { state: "detached", timeout: 30_000 });
}

// First launch shows the name prompt; fill it in and continue to the menu.
async function setName(page, name) {
  const gate = page.locator(".dlg-name-gate");
  await gate.waitFor({ timeout: 10_000 });
  await gate.getByRole("textbox").fill(name);
  await gate.getByRole("button", { name: "Save name" }).click();
  await gate.waitFor({ state: "detached" });
}

/**
 * Dev mode's previews, by the labels of its buttons: [button, file, how it closes].
 * "panel" closes with Escape, "preview" with its Close preview button, "notice" with Escape,
 * "toast" closes itself.
 */
const SCREENS = [
  ["Panels", [
    ["Settings", "settings", "panel"],
    ["Profile", "profile", "panel"],
    ["Customise", "customise", "panel"],
    ["Coin shop", "coin-shop", "panel"],
    ["Wallet", "wallet", "panel"],
    ["About", "about", "panel"],
    ["Leaderboard", "leaderboard", "panel"],
    ["Friends", "friends", "panel"],
    ["Welcome", "welcome", "preview"],
  ]],
  ["Waiting room", [
    ["Waiting room (host)", "lobby-host", "preview"],
    ["Waiting room (guest)", "lobby-guest", "preview"],
    ["Private room", "lobby-private", "preview"],
    ["Private room: invite", "lobby-invite", "preview"],
    ["Paid arena: searching", "lobby-paid", "preview"],
    ["Waiting room (offline)", "lobby-offline", "preview"],
  ]],
  ["Match", [
    ["Countdown 3", "countdown-3", "preview"],
    ["Countdown 2", "countdown-2", "preview"],
    ["Countdown 1", "countdown-1", "preview"],
    ["GO!", "go", "preview"],
    ["Match HUD", "hud", "preview"],
    ["Match HUD (touch)", "hud-touch", "preview"],
    ["Match HUD: players out", "hud-out", "preview"],
    ["Results: Training", "results-training", "preview"],
    ["Results: paid win", "results-win", "preview"],
    ["Results: lost", "results-lost", "preview"],
    ["Results: draw", "results-draw", "preview"],
    ["Level up", "level-up", "notice"],
    ["Waiting for the server", "server-wait", "preview"],
  ]],
  ["Messages", [
    ["Toast", "toast", "toast"],
    ["Toast: error", "toast-error", "toast"],
    ["Toasts: several", "toasts", "toast"],
    ["Friend request", "msg-friend-request", "notice"],
    ["Room closed", "msg-room-closed", "notice"],
    ["Close the room?", "msg-close-room", "notice"],
    ["Not enough coins", "msg-not-enough-coins", "notice"],
    ["Server unreachable", "msg-server-unreachable", "notice"],
    ["Back online", "msg-back-online", "notice"],
    ["Room connection lost", "msg-connection-lost", "notice"],
    ["Couldn't join", "msg-couldnt-join", "notice"],
    ["Buy this item?", "msg-buy", "notice"],
  ]],
];

const captured = { desktop: [], phone: [] };

async function everyScreen(kind, options) {
  const dir = `${OUT}/${kind}`;
  mkdirSync(dir, { recursive: true });
  const { page } = await player(`dev-${kind}`, options);
  const url = new URL(BASE);
  url.searchParams.set("dev", "");
  await page.goto(url.toString());
  await bootDone(page);
  await setName(page, "Usef");
  await sleep(1500);
  await page.screenshot({ path: `${dir}/home.png` });
  captured[kind].push(["Home", "home"]);

  const devPanel = () => page.locator(".dlg-dev-panel");
  const openDev = async () => {
    if (!(await devPanel().count())) await page.getByRole("button", { name: "Dev mode" }).click();
    await devPanel().waitFor({ timeout: 10_000 });
  };
  for (const [, screens] of SCREENS) {
    for (const [label, file, close] of screens) {
      try {
        await openDev();
        await devPanel().getByRole("button", { name: label, exact: true }).click();
        await sleep(close === "toast" ? 500 : 1400);
        await page.screenshot({ path: `${dir}/${file}.png` });
        captured[kind].push([label, file]);
        console.log(`saved ${dir}/${file}.png`);
        if (close === "preview") await page.getByRole("button", { name: "Close preview" }).click();
        else if (close === "panel" || close === "notice") {
          await page.keyboard.press("Escape");
          await sleep(500);
          // Some popups need a second press (a notice over a panel)
          if (await page.locator(".overlay--notice").count()) await page.keyboard.press("Escape");
        } else await sleep(2800); // toasts go away on their own
        await sleep(600);
      } catch (error) {
        console.warn(`[${kind}] ${label}: ${error instanceof Error ? error.message : error}`);
        await page.keyboard.press("Escape").catch(() => undefined);
      }
    }
  }
  await page.context().close();
}

/** docs/SCREENSHOTS.md: every screen, phone and desktop side by side. */
function writeGallery() {
  const rel = OUT.replace(/^docs\//, "");
  const lines = [
    "# Mini Sumo: every screen",
    "",
    "Taken automatically by [tools/screenshots.mjs](../tools/screenshots.mjs) (*Actions → Screenshots → Run workflow*): a real match, then every screen and popup through dev mode's previews (sample data), on a phone and on a desktop.",
    "",
    "## A real match",
    "",
    "| | |",
    "| --- | --- |",
    `| <img src="${rel}/welcome.png" width="420" alt="Welcome" /> | <img src="${rel}/menu.png" width="420" alt="Home" /> |`,
    `| <img src="${rel}/wardrobe.png" width="420" alt="Customise" /> | <img src="${rel}/lobby.png" width="420" alt="Waiting room" /> |`,
    `| <img src="${rel}/countdown.png" width="420" alt="Countdown" /> | <img src="${rel}/bout.png" width="420" alt="Bout" /> |`,
    `| <img src="${rel}/results.png" width="420" alt="Results" /> | <img src="${rel}/mobile.png" width="200" alt="On a phone" /> <img src="${rel}/home-phone.png" width="200" alt="Home on a phone" /> |`,
    "",
  ];
  const have = (kind, file) => captured[kind].some(([, f]) => f === file);
  const sections = [["Home", [["Home", "home"]]], ...SCREENS.map(([title, screens]) => [title, screens.map(([label, file]) => [label, file])])];
  for (const [title, screens] of sections) {
    lines.push(`## ${title}`, "", "| Screen | Phone | Desktop |", "| --- | --- | --- |");
    for (const [label, file] of screens) {
      const phone = have("phone", file) ? `<img src="${rel}/phone/${file}.png" width="180" alt="${label} on a phone" />` : "–";
      const desk = have("desktop", file) ? `<img src="${rel}/desktop/${file}.png" width="380" alt="${label} on a desktop" />` : "–";
      lines.push(`| ${label} | ${phone} | ${desk} |`);
    }
    lines.push("");
  }
  writeFileSync("docs/SCREENSHOTS.md", `${lines.join("\n")}\n`);
  console.log("wrote docs/SCREENSHOTS.md");
}

try {
 try {
  // 1. Host: main menu, then create a private room.
  const host = await player("Usef");
  await host.page.goto(BASE);
  await bootDone(host.page);
  await sleep(1000);
  await shot(host.page, "welcome");
  await setName(host.page, host.name);
  await sleep(800);
  await shot(host.page, "menu");


  // Wardrobe: give the host a custom look.
  await host.page.getByRole("button", { name: "Customise your wrestler" }).click();
  for (const [tab, option] of [
    ["Hair", "Ponytail"],
    ["Colour", "Ginger"],
    ["Face", "Wink"],
    ["Outfit", "Polka dots"],
  ]) {
    await host.page.getByRole("tab", { name: tab }).click();
    await host.page.getByRole("button", { name: new RegExp(`^${option},`) }).click();
    await sleep(300);
    // Not owned: a buy window opens; close it (these are all free, but don't get stuck).
    if (await host.page.locator(".overlay--notice").count()) await host.page.keyboard.press("Escape");
  }
  await sleep(1500);
  await shot(host.page, "wardrobe");
  await host.page.getByRole("button", { name: "Close" }).click();

  // The host opens a Training room; the others join the same public room.
  // Training has its own button on the home screen: it opens the Training card, then PLAY.
  const playTraining = async (page) => {
    await page.getByRole("button", { name: "Training Arena", exact: true }).first().click();
    await page.getByRole("button", { name: /^Play the Training Arena/ }).click();
  };
  await playTraining(host.page);
  await host.page.waitForSelector(".roster");

  // 2. Two more players join (one on a phone viewport).
  const guests = [await player("Kenta"), await player("Mika", { ...devices["Pixel 7"] })];
  for (const guest of guests) {
    await guest.page.goto(BASE);
    await bootDone(guest.page);
    await setName(guest.page, guest.name);
    if (guest.name === "Mika") {
      await sleep(1200);
      await shot(guest.page, "home-phone");
    }
    await playTraining(guest.page);
    await guest.page.waitForSelector(".roster");
  }
  await sleep(2500);
  await shot(host.page, "lobby");

  // 3. Countdown.
  await host.page.getByRole("button", { name: "Start match" }).click();
  await host.page.waitForSelector(".countdown__num");
  await sleep(400);
  await shot(host.page, "countdown");

  // 4. Bout: everyone charges toward the centre, the host dashes.
  await sleep(3000);
  // Spawn slots for 3 players: host left, guest 1 top-right, guest 2 bottom-right.
  const [kenta, mika] = guests;
  await host.page.keyboard.down("KeyD");
  await kenta.page.keyboard.down("KeyA");
  await kenta.page.keyboard.down("KeyS");
  await mika.page.keyboard.down("KeyA");
  await mika.page.keyboard.down("KeyW");
  await sleep(700);
  await host.page.keyboard.press("Space");
  await sleep(450);
  await shot(host.page, "bout");
  await shot(mika.page, "mobile");

  // 5. Keep pushing until the round ends (at the latest when the 90 s timer runs out).
  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline && !(await host.page.locator(".dlg-results").count())) {
    await host.page.keyboard.press("Space");
    await kenta.page.keyboard.press("Space");
    await sleep(1600);
  }
  if (await host.page.locator(".dlg-results").count()) {
    await sleep(1500);
    await shot(host.page, "results");
  } else {
    console.warn("round did not finish in time; results.png not updated");
  }

 } catch (error) {
  // The real match is the fragile part: report it and still take every other screen.
  console.warn("real match:", error instanceof Error ? error.message : error);
 }

  // ------------------------------------------------------------ Part 2: every screen
  await everyScreen("desktop", { viewport: { width: 1280, height: 720 } });
  await everyScreen("phone", { ...devices["Pixel 7"] });
  writeGallery();
} finally {
  await browser.close();
}
