// Captures README screenshots of a real local match (3 players, one on a phone viewport).
// Requires the server on :2567 and the built client served on :4173 (see the Screenshots workflow).
//
//   npm install --no-save playwright && npx playwright install --with-deps chromium
//   node tools/screenshots.mjs [baseUrl] [outDir]
import { mkdirSync } from "node:fs";
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
  }
  await sleep(1500);
  await shot(host.page, "wardrobe");
  await host.page.getByRole("button", { name: "Close" }).click();

  // The host opens a Training room; the others join the same public room.
  const playTraining = (page) => page.getByRole("button", { name: /^Play Training Arena/ }).click();
  await playTraining(host.page);
  await host.page.waitForSelector(".roster");

  // 2. Two more players join (one on a phone viewport).
  const guests = [await player("Kenta"), await player("Mika", { ...devices["Pixel 7"] })];
  for (const guest of guests) {
    await guest.page.goto(BASE);
    await bootDone(guest.page);
    await setName(guest.page, guest.name);
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
} finally {
  await browser.close();
}
