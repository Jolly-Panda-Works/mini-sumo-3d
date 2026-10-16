# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

Releases use the root `package.json` version and are tagged `vX.Y.Z` automatically.

## [Unreleased]

### Changed

- Home: one row of buttons on top (profile box with name and level filling the width, then customise, settings and coins on the right), the title below it. *Play with friends* removed.
- Bot difficulty fits on one line on the Training card.
- HUD: the "N in the ring" counter next to the timer is gone; the final-stretch glow only shows while you're still in the ring.
- Training pays no coins (it still gives XP and counts for stats), on the device and on the server.
- Bots-only finish: when every human is out and two bots are left, one of them gives up so the bout ends quickly.

### Fixed

- Version bump started from `package.json` even when older releases (from the previous run-number scheme, e.g. `v1.0.37`) were higher, so a patch bump produced `v1.0.1`. Bumps now start from the highest `vX.Y.Z` tag, and a push whose `package.json` version is below the latest release fails with a clear message instead of releasing.

### Added

- Sound effects from files (`apps/client/public/sfx/`): button click, "not available" for buttons that can't be used yet (they now explain why when tapped), dialog open/close, purchase, level up, knocked out, and a sting when the final stretch begins.
- Level-up popup after a bout: the old level floats up and fades, the new one rises into its place with the level-up sound, then the coin reward appears.
- Coins for every level reached: 50 + 25 × level (level 2 = 100, level 5 = 175, level 10 = 300), on the device and on the server (`levelUpReward`, ledger category `level_up`). The results screen lists the reward.

### Added

- Game icons (medals, settings, customise, coin, plus, music, sound, difficulty, bot, close, Google Play, arrows) and new coin-pack art.
- Walk-in before every bout: wrestlers wait at the ring side in the lobby, bots join one by one (with a pop and a puff of dust), then everyone walks to the start marks, the 3-2-1 runs and the referee's whistle starts the bout.
- Ring-outs are credited to the last wrestler in contact: the crowd cheers when you push someone out and groans when you're pushed out. Profile counts *Wrestlers pushed out*.
- Final 30 seconds: the music speeds up a little and a glow around the screen turns from yellow to red.
- Daily coins in the shop (100, once a day).
- Arena row arrows for mouse users.

### Changed

- Rookie Arena entry is 50 coins (prize up to 180).
- Arena entry popup: artwork and name, entry fee on the left, prize on the right, and one *Enter* button.
- Profile: name with a pencil button (opens an edit popup), stats for bouts, wins, wrestlers pushed out, best win streak and items bought; coin history, customise and the arena list removed.
- Settings footer: version in the middle, *About* on the right. Settings aren't available in the waiting lobby.
- The wardrobe's try-on popup closes with *Not now* (no ×).

### Fixed

- Bots appeared in the middle of the ring and jumped outwards when the match started.

### Changed

- When you're pushed out, a *Return home* button replaces the joystick and dash button.
- Home: the buttons sit on top, the title below them, then the arenas.
- Waiting lobby: no customise button or timer text; the Start button shows *Start match in N…*, unlocks one second after the wait and the host starts the bout (quick-match rooms no longer start by themselves once bots fill in).
- Results: placements are numbers 1–4, with gold, silver and bronze medals for the top three.

### Added

- On-device economy: 200 starting coins, wallet and history, wardrobe purchases, paid arenas against bots with prizes and refunds, training rewards, XP and levels (Pro at level 5, Champion at level 10). Only buying coins stays *Coming soon*.
- Profile panel: name, level and XP bar, stats, arena unlocks, coin history.
- End-of-bout rewards on the results screen: prize, rewards, XP and level-ups.
- Wardrobe try-on popup for items you don't own: preview on your wrestler, name, price, Buy / Not now.

### Changed

- All popups use one dialog: sticky title and a close (×) button in the top-right corner; content scrolls underneath.
- Settings: Audio and Controls only, About with the version; in a match, Audio, Controls and *Leave match*. Profile and Gameplay sections removed (bot difficulty is picked on the Training card; other arenas choose it at random for their tier).
- Wardrobe fills the screen; the preview and category tabs stay fixed and only the items scroll. *Surprise me* removed.
- Results: no extra *Leave room* button; paid bouts offer *Home* and *Play again*.
- Coin shop: *History* removed (it lives in Profile).
- Arenas, rewards, prize formula and levels moved to `packages/shared` (one rulebook for the device and the server); the server tracks XP and unlocks arenas by level.

### Fixed

- Wardrobe: after tapping an item you didn't own, the purchase bar blocked buying other items.

### Changed

- Releases are tagged automatically from the root `package.json` version: pushing a new version to `main` creates tag `vX.Y.Z` and the Release; *Run workflow* with **bump** (patch/minor/major) bumps, commits, tags and releases in one go. Pushes without a version change build artifacts only. Android `versionCode` is derived from the version.

### Changed

- The Android app is portrait-only (`apps/mobile/scripts/orientation.mjs`, replaces `landscape.mjs`); web manifest orientation is portrait. The home screen stacks the buttons above the title on portrait screens and arena cards are sized for one-thumb swiping.

### Fixed

- Signed Android release: CI could ship Gradle's *unsigned* release APK under the "signed" name, which phones reject ("package appears to be invalid"). Release builds are now signed by Gradle's injected signing config, verified with `apksigner`/`jarsigner`, and the keystore secrets are checked first. Files: `…-Android.apk` (signed), `…-Android.aab` (Play), `…-Android-debug.apk`.

### Changed

- Music now uses two loops (`apps/client/public/music/`): a bamboo-flute track for home, lobby and results, and a taiko track for bouts, with a 1.6–1.8 s crossfade between them. Music and effects pause while the app is in the background. The procedural music was removed.

### Added

- Coin shop with six Sumo Coin packs (all *Coming soon*), opened from the coin button on the home screen.
- Android release guide (`docs/ANDROID-RELEASE.fa.md`), Play Store icon and feature graphic (`docs/store/`), optional `ANDROID_TARGET_SDK` CI variable.

### Changed

- Three free items per wardrobe category; every other item shows its price and *Buy · Coming soon* until the shop opens.
- Android application id is `com.jollypanda.mini_sumo`.
- About shows only the creator and www.useffarahmand.com.
- The Baloo 2 font is bundled (`@fontsource/baloo-2`): no requests to Google Fonts, works fully offline.
- The home screen always shows the coin balance.

### Added

- Bot difficulty: Easy, Normal and Hard (Training card and *Settings → Gameplay*); fixed per room, training matchmaking filtered by level.
- Comeback balance in the last 30 seconds of a bout: players' dash recharges faster (down to 55 % of the cooldown) and bots ease off. The HUD shows a "Final stretch" badge and the dash meter follows the shorter cooldown.

### Changed

- Wardrobe: tabs per category (hair, colour, face, outfit) showing only that category; every item shows its price, owned items are listed first and stay owned. 36 items in total (new: ponytail, afro, twin buns, samurai band; pink, green, purple, gold, white; wink, surprised, grumpy, sparkly eyes; polka dots, sagari fringe, hero cape, armbands).
- Only the first option of each category is a free starter item; prices live in one shared table (`COSMETIC_PRICES`).
- Home shows the coin balance next to the customise and settings buttons; *Change avatar* removed from settings.

### Changed

- Home: the Training Arena is a card next to the other three; the title is centred; the home screen has its own backdrop (spotlights, stars, seigaiha waves) and the 3D arenas are only rendered inside rooms.

### Fixed

- Arena card accent bars and edges showed through dialogs (wardrobe, settings): dialogs now sit on their own layer with a darker backdrop.

### Added

- Loading screen with the game logo and a filling progress bar with percentage (artwork, fonts, server check and first 3D frame).

### Changed

- Arena cards and the Training button use the new arena artwork; the 3D themes follow it (Training Grounds, Park Festival, Night Stadium, Grand Final).
- The home title is the new *Mini Sumo* typography artwork.
- Removed the generated SVG card art (`tools/arena-art.ts`, `docs/arenas/*.svg`).

### Changed

- New home screen: the game title, the paid arenas side by side (art, mood, entry fee, prize) and a separate Training button; *Play now*, the logo and the name field moved out. Private rooms live under *Play with friends*.
- Each arena has its own theme in 3D and on its card: Training Dojo, Festival Street, Moonlit Temple, Golden Palace. Card art is in `docs/arenas/`.
- Wardrobe: the 3D preview always stays visible; only the options scroll.
- Settings: name, avatar, music and sound-effect volume, controls, About, and *Save progress to Google account* (coming soon).
- Server-only features show *Coming soon* instead of offline-mode messages.
- Android app is locked to landscape (`scripts/landscape.mjs`).

### Added

- Original procedural background music (menu and bout themes).

### Added

- Virtual-currency economy (server-authoritative): device-bound guest accounts, Sumo Coin wallet, append-only ledger with idempotency keys, SQLite persistence via `node:sqlite`.
- Arenas: free Training plus Rookie (100), Pro (500) and Champion (2,000) entry tiers. Entry fees charged atomically on join, winner paid the pool minus a 10 % economy fee, draws and unstarted bouts refunded, settlement exactly once per match, startup recovery refunds.
- Free rewards in the Training Arena with a daily first-bout bonus and a daily cap.
- Cosmetic shop inside the existing wardrobe: priced items, try-on preview, idempotent purchases, owned-only equipping enforced by the server.
- Arena selection, wallet and transaction history screens; prize and refund summary on the results screen.
- Feature flags for economy, shop, premium currency (off) and real-money purchases (off); provider-independent payment boundary that always refuses.
- Economy event log lines for future balancing.

### Changed

- Node.js 22.13 or newer is required.

### Fixed

- Phones: the arena looked washed out behind a pale layer. The fog used fixed distances while portrait screens put the camera much farther away; fog now follows the camera distance.
- Phones: wider field of view in portrait so the camera comes about a third closer (bigger wrestlers), and the ring sits lower, in the free space below the HUD.

### Added

- Offline practice mode: while no online server is available, every room runs locally in the client with the same GameSession as the server, against bots. Production builds without `VITE_SERVER_URL` start offline; online builds fall back to offline when the server can't be reached. `VITE_NETWORK_MODE` forces `online`, `offline` or `auto`.

### Changed

- Mobile controls: floating joystick that appears under your thumb anywhere on the left side (or a fixed corner stick), a larger dash button with a countdown, vibration on dashes, hits and ring-outs, and controls hide once you are out of the round. New settings: *Joystick* and *Vibration*.

### Fixed

- *Play now* always failed with "That room is full or a match is already running": the room assigned to Colyseus' read-only `locked` property while being created.
- The first-launch name prompt now covers the game with a dark backdrop and nothing else is shown behind it.

### Added

- Bots: the host of a private room can add and remove computer-controlled wrestlers in the lobby.
- Quick match: *Play now* waits up to 30 seconds for other players, then fills the room with bots (ordinary random names, same look as players) and starts automatically.
- First-launch name prompt; the name is saved for next time.
- Character customisation before a match: hair style and colour, face and outfit, with a live 3D preview. The look is saved, sent when joining and synced to everyone; the belt keeps the player colour. Bots get a random look.

## [0.1.0] - 2026-10-15

### Added

- 3D multiplayer sumo party game for 2 to 4 players, rendered with React Three Fiber.
- Authoritative Colyseus server: quick match, private rooms, invite links, host controls, rematch.
- Momentum-based pushing, dash with cooldown, ring-outs, timeout tiebreaker, draws and standings.
- Keyboard and touch controls, synthesised sound effects, settings and an About section.
- Desktop apps (Windows, macOS, Linux) with Electron and an Android app with Capacitor.
- GitHub Actions: tests, web build with optional GitHub Pages deploy, desktop and Android builds, automatic releases with checksums, screenshot workflow.
- Standalone server package with a step-by-step Ubuntu deployment guide (Persian).

[Unreleased]: https://github.com/Jolly-Panda-Works/mini-sumo-3d/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Jolly-Panda-Works/mini-sumo-3d/releases/tag/v0.1.0
