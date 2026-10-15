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

// First launch shows the name prompt; fill it in and continue to the menu.
async function setName(page, name) {
  const gate = page.locator(".name-gate");
  await gate.waitFor({ timeout: 10_000 });
  await gate.getByRole("textbox").fill(name);
  await gate.getByRole("button", { name: "Save name" }).click();
  await gate.waitFor({ state: "detached" });
}

try {
  // 1. Host: main menu, then create a private room.
  const host = await player("Usef");
  await host.page.goto(BASE);
  await host.page.waitForSelector("canvas");
  await sleep(2500);
  await shot(host.page, "welcome");
  await setName(host.page, host.name);
  await sleep(800);
  await shot(host.page, "menu");


  // Wardrobe: give the host a custom look.
  await host.page.getByRole("button", { name: "Customise your wrestler" }).click();
  for (const option of ["Mohawk", "Ginger", "Fierce", "Champion"]) {
    await host.page.getByRole("button", { name: option, exact: true }).click();
  }
  await sleep(1500);
  await shot(host.page, "wardrobe");
  await host.page.getByRole("button", { name: "Done" }).click();

  await host.page.getByRole("button", { name: "Play with friends" }).click();
  await host.page.getByRole("button", { name: "Create private room" }).click();
  await host.page.waitForSelector(".room-code");
  const code = (await host.page.locator(".room-code").innerText()).trim();
  console.log("room", code);

  // 2. Two guests join through the invite link (one on a phone viewport).
  const guests = [await player("Kenta"), await player("Mika", { ...devices["Pixel 7"] })];
  for (const guest of guests) {
    await guest.page.goto(`${BASE}?room=${encodeURIComponent(code)}`);
    await guest.page.waitForSelector("canvas");
    await setName(guest.page, guest.name);
    // The invite link opens the friends panel with the code filled in.
    await guest.page.getByRole("button", { name: "Join room" }).click();
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
  while (Date.now() < deadline && !(await host.page.locator(".results__headline").count())) {
    await host.page.keyboard.press("Space");
    await kenta.page.keyboard.press("Space");
    await sleep(1600);
  }
  if (await host.page.locator(".results__headline").count()) {
    await sleep(1500);
    await shot(host.page, "results");
  } else {
    console.warn("round did not finish in time; results.png not updated");
  }
} finally {
  await browser.close();
}
