# Mini Sumo: UI art master prompt

راهنمای ساخت همه‌ی المان‌ها و صفحه‌های UI بازی با یک سبک یکسان (کشتی سومو ژاپنی، کارتونی).
پرامپت‌ها انگلیسی‌اند چون مدل‌های تصویرساز با انگلیسی دقیق‌ترند.

**روش استفاده:** برای هر المان، این سه بخش را پشت هم بفرستید:

1. **Style block** (بخش ۱): در هر درخواست، بدون هیچ تغییری
2. **Technical rules** (بخش ۲): برای المان‌های تکی؛ برای صفحه‌های کامل، خط مخصوص بخش ۵
3. **Asset line**: یک ردیف از کاتالوگ (بخش ۴) یا یک صفحه (بخش ۵)، با اندازه و متنش

اندازه‌های کاتالوگ همان اندازه‌ی فایل‌های فعلی در `apps/client/public` هستند، پس هر فایل تازه بدون تغییر کد جای قبلی می‌نشیند.

---

## 1. Style block (prefix every request)

```
STYLE — "Mini Sumo" mobile game UI.
A cheerful, chunky cartoon art style for a casual Japanese sumo wrestling game, like a polished
mobile game UI kit. Hand-painted 2D game art with clean, bold dark-brown outlines (#2B1A10,
about 4–6 px at 1024 px), soft cel shading with one highlight and one shadow tone, and light
coming from the top-left. Shapes are rounded, thick and toy-like, never thin or sharp.

THEME — a traditional sumo dohyo and Shinto shrine festival:
- Materials: warm lacquered wood planks (#7A4A2A to #A0663C) with visible grain, dark wood
  trims, cream rice-paper / parchment panels (#F3E3C3, #FFF4DC), red lacquer (#C8322B, deep
  #8E1F1F), brushed gold corner caps and studs (#F2B21E to #D18A0E).
- Ornaments: red-and-white twisted shimenawa rope with tassels, white zig-zag shide paper
  streamers, straw tawara rope, small torii / shrine roof shapes (curved eaves), nobori
  festival banners, paper lanterns, fans, mon-style round emblems, seigaiha wave pattern.
- Used sparingly: one or two ornaments per element, so the element stays readable at small size.

PALETTE — ink #2B2340, sun yellow #FFC23C, coral #FF5D73, clay #E7C996, clay-deep #C98A55,
sky blue #4A7DB3, night navy background #1E2A4A. Player colours: red #E2443A, blue #3D7FE0,
green #3FA34D, yellow #F2B21E. Positive buttons are glossy green (#5BBF2E to #2E8A1F),
secondary buttons are wood brown, danger buttons are red lacquer.

TYPE — any baked-in text is short, UPPERCASE, in a heavy rounded display font (like
"Baloo 2 ExtraBold"), cream or sun-yellow letters with a dark-brown outline and a small drop
shadow. It must be spelled exactly as given, with no extra words.

MOOD — friendly, festive, slightly humorous, for all ages. Never gory, scary or realistic.
```

## 2. Technical rules (single elements)

```
OUTPUT RULES
- One single isolated element, centred, on a fully TRANSPARENT background (PNG with alpha).
  No scene, no mock-up, no hands, no device frame, no drop shadow on the background.
- Exact canvas size: {W}x{H} px. The element fills the canvas edge to edge with at most 4 px
  of padding; keep the art's aspect ratio exactly.
- Front view, flat (no perspective tilt), crisp edges, no blur, no noise, no watermark,
  no signature, no UI text other than what is asked.
- Frames and panels: keep the inner content area EMPTY and flat (plain parchment, wood or
  dark red), because the game draws its own text and pictures there.
- 9-slice frames: ornaments only at the four corners and the edges; edges must be plain and
  repeatable so the frame can stretch.
- Buttons: the label is baked into the art, centred, with an icon on the left only if asked.
  Every button family shares the same height, corner radius, outline and bevel.
```

**Negative prompt** (for tools that support one):

```
photo, realistic, 3D render, gradient mesh, thin lines, pixel art, anime screenshot, Chinese
dragon, Korean style, neon, sci-fi, metal chrome, blood, text errors, extra letters, misspelled
words, watermark, logo, frame around the whole image, background scenery, perspective,
cropped element, multiple variations in one image
```

---

## 3. Request template

```
{Style block}

{Technical rules with W and H filled in}

ASSET: {name} — {description}. Baked text: "{TEXT}" (or: no text).
```

Example:

```
… style block … technical rules (720x80) …
ASSET: toast-plank — a long horizontal red lacquer plank label with small gold corner caps
and thin gold inner trim, a 9-slice frame for one line of notice text. Empty centre. No text.
```

---

## 4. Asset catalogue

Each line is: file (canvas size), then what to draw. **Text** is the baked label.

### 4.1 Buttons: primary (glossy green) and secondary (wood)

| File (px) | What to draw | Text |
|---|---|---|
| `btn-play` (287×91) | green glossy pill with a gold rim and a white play triangle on the left | PLAY |
| `btn-start` (720×201) | big green start button with rope accent on top | START |
| `btn-enter` (360×95) | green button | ENTER |
| `btn-rematch` (360×110) | green button, circular-arrows icon | REMATCH |
| `btn-play-again` (360×113) | green button | PLAY AGAIN |
| `btn-home` (360×114) | wood plank button, gold corner studs, house icon | HOME |
| `btn-return-home` (360×114) **new** | same family as HOME, house icon | RETURN HOME |
| `btn-leave` (503×139) | red lacquer button, door-with-arrow icon | LEAVE |
| `btn-great` (361×115) | green button | GREAT! |
| `btn-save` (329×124) | green button | SAVE |
| `btn-buy` (439×147) | green button, word on the left and an EMPTY dark field on the right for the price | BUY |
| `btn-claim` / `btn-claimed` (440×147) | green button / greyed-out wood with a check mark | CLAIM / CLAIMED |
| `btn-coming-soon` (371×113) | desaturated wood button with a small padlock | COMING SOON |
| `btn-not-now` (373×146) | wood button | NOT NOW |
| `btn-about` (321×142) | wood button | ABOUT |
| `btn-share` (360×160) | wood button, share icon | SHARE |
| `btn-copy-invite` (480×130) | wood button, chain-link icon | COPY INVITE |
| `btn-add-random` (460×155) | wood button, dice icon | ADD RANDOM PLAYER |
| `btn-invite` / `btn-sent` (206×124) | small green / small grey-wood button | INVITE / SENT |
| `btn-accept` / `btn-decline` (206×123) | small green / small red | ACCEPT / DECLINE |
| `btn-play-friend` (207×125) | small green | PLAY |
| `btn-remove-friend` (300×91) | small red lacquer | REMOVE |
| `btn-email-signin` / `btn-email-connected` (480×135) | wood button, envelope icon / same with a green check | SIGN IN WITH EMAIL / EMAIL CONNECTED |
| `gplay-sign-in` / `gplay-connected` (480×132) | wood button, a generic play-triangle game-controller icon (not Google's logo) | SIGN IN / CONNECTED |
| `btn-add` (140×105), `btn-edit` (140×146) | square wood buttons, plus / pencil icon | no text |
| `close` (160×171) | round red lacquer button, white X, gold ring | no text |

### 4.2 Notice-popup buttons (all 360×97, one family)

`notice-ok` OK · `notice-retry` RETRY · `notice-close` CLOSE · `notice-leave` LEAVE ·
`notice-stay` STAY · `notice-shop` SHOP · `notice-not-now` NOT NOW. Prompt: "a wide flat
wood-plank button with a thin gold trim, label centred".

### 4.3 Labels, tags and plaques

| File (px) | What to draw | Text |
|---|---|---|
| `label-empty` (240×54) | red lacquer plank, gold corner caps, 9-slice | none |
| `toast-plank` (720×80) **new** | long red plank for notices, 9-slice, small gold caps | none |
| `label-level` (202×91) | small gold-edged red tag with a star on the left, empty right | none |
| `label-you` (220×80), `label-host` (200×114) | small ribbon tags | YOU / HOST |
| `label-free` (160×93) | green ribbon tag | FREE |
| `label-popular` (220×68), `label-best-value` (220×62) | coral / gold corner ribbons | POPULAR / BEST VALUE |
| `label-version` (430×113) | thin wood plaque, empty | none |
| `badge-p1` … `badge-p4` (120×120) | round mon emblem in the player colour (red, blue, green, yellow) | P1 … P4 |
| `dot-online` / `dot-offline` (35×35) | glossy green / grey dot with outline | none |
| `out` (hud, 220×68) | a stamped red hanko-seal banner, slightly tilted | OUT |

### 4.4 Frames and panels (empty centres)

| File (px) | What to draw |
|---|---|
| `frame` (1094×1422) | main panel: wood frame, parchment centre, red-white rope across the top with tassels, gold corners (9-slice) |
| `header` (1152×674) | shrine-roof title sign: red curved eaves, shimenawa rope, white shide streamers, side nobori flags, dark-red empty sign board |
| `popup-message` / `popup-warning` / `popup-error` (480×803) | tall hanging board: wooden title plank on top, parchment body; title plank tinted wood / sun yellow / red |
| `popup-sub` (485×827) | hanging board with an empty top plank and rope swag (sub-panels) |
| `results-board` (698×950) | scoreboard: title plaque on top, four empty rows with red place tabs "1st 2nd 3rd 4th" (gold, silver, bronze, wood numerals) |
| `levelup-frame` (700×538) | celebration frame with gold rays behind, empty centre, small fans in the corners |
| `welcome-frame` (451×479) | friendly frame with a lantern on each side, empty lower content area |
| `arena-panel` (456×706) | arena card: picture window on top, parchment info area below, rope on top |
| `lb-panel` (700×597), `lb-row` (700×139), `lb-row-you` (700×146), `lb-rank` (160×160), `lb-score` (300×121) | leaderboard: panel, plain wood row, highlighted gold row, round rank medal, score plaque |
| `friend-card` (961×285), `friend-code` (314×103) | wide wood card with an empty avatar circle on the left / small code plaque |
| `profile-frame` (516×192) | player card: round avatar socket left, name strip and level strip right |
| `edit-name-frame` (800×411), `input-field` (554×116) | name-edit board / sunken parchment text field |
| `coin-frame` (469×143) | coin counter pill: gold coin socket left, dark field, small green "+" on the right |
| `reward-coin` (480×179), `reward-xp` (480×176) | reward ribbons with a coin / star badge on the left, empty right |
| `powerup-frame` (174×436) | vertical lantern-shaped frame with a round emblem socket on top |
| `timer-circle` (202×207) | round red-and-gold taiko-drum timer with an empty cream face |
| `vibration-frame` (386×140), `vibration-on` / `vibration-off` (97×58) | settings toggle frame / green and grey toggle knobs |
| `private-room-button` (960×536) | wide card showing a cosy private dojo with sliding paper doors (no text) |

### 4.5 Match HUD

| File (px) | What to draw |
|---|---|
| `player-red/blue/green/yellow` (700×164) | player frame strip in the player colour: avatar socket left, name bar and level bar right |
| `count-3`, `count-2`, `count-1` (≈150×217) | big chunky countdown numerals, sun yellow with a thick ink outline |
| `go` (360×236) | "GO!" burst in coral and yellow with speed lines |
| `dash` (256×256) | round dash button: red lacquer drum with a white dash/arrow symbol |
| `joy-base` (300×342), `joy-knob` (160×169) | joystick: round wood-and-gold ring with the four arrows / glossy cream knob |
| `banner-oshidashi` (900×260) **new** | brush-stroke finish banner, coral and gold, for the winning push-out; text OSHIDASHI! |
| `banner-ring-out` (900×260) **new** | same family; text RING OUT! |
| `banner-shrinking` (900×200) **new** | warning banner with small hazard rope; text RING SHRINKING! |

### 4.6 Icons (square, transparent, no text)

| File (px) | Subject |
|---|---|
| `icon-shop` / `icon-settings` / `icon-leaderboard` / `icon-daily` / `icon-wheel` / `icon-achievements` / `icon-training` / `icon-upgrade` (256×256) | shop stall with noren curtain / gear with rope / trophy on a cushion / calendar scroll / fortune wheel / medal box / training post (makiwara) / up-arrow on a gold mon |
| `friends-icon` (216×221) | two little sumo heads side by side |
| `coin` (128×128) | gold coin with a sumo-topknot emblem |
| `medal-gold/silver/bronze` (256×256) | round medals on red-white cords |
| `easy` / `normal` / `hard` (320×320) | chibi sumo face: smiling / determined / fierce with steam |
| `bot` (256×256) | cute wooden training-dummy face |
| `music` / `sfx` / `settings` / `plus` / `customize` | taiko drum with notes / hand bell / gear / plus in a mon / mawashi belt with a brush |
| `arrow-left/right/up` (128×128) | chunky wood arrows |

### 4.7 Backgrounds and boot

| File (px) | What to draw |
|---|---|
| `bg-tile` (1024×1024) | seamless tile: dark navy with a subtle seigaiha wave pattern and a few faint fans; low contrast, no focal point |
| `boot/loading-bg-wide` | wide festival night sky over a dohyo, lanterns, soft vignette |
| `boot/bar-frame` / `bar-fill` | loading bar: wood frame with rope ends / red-to-gold fill (9-slice) |
| `boot/game-logo` | "MINI SUMO" logo: two round sumo wrestlers pushing over a dohyo in a circle badge, the title in chunky sun-yellow letters |

### 4.8 Arena pictures (`arenas/*.webp`, card art, same framing for all)

One dohyo seen from a high three-quarter angle, two chibi wrestlers facing off, no text,
each with its own setting and a level-up feel:

`training` outdoor practice yard with a straw makiwara · `rookie` park festival with green
flags · `amateur` school gym stadium · `pro` night stadium with spotlights · `veteran` old
wooden hall with lanterns · `champion` grand hall with a gold roof · `master` temple
courtyard with cherry trees · `legend` hall of legends with banners of past champions ·
`godlike` ring floating on clouds under a starry sky · `private` cosy private dojo.

---

### 4.9 Cafe Bazaar build **new**

Used only in the Cafe Bazaar version. Until they exist, the game draws plain buttons for them.
Bazaar's sign-in colours are green **#0EA960** with a **#09663A** border; keep them for the
sign-in buttons so players recognise them. Leave the **logo square empty**: the game puts the official Cafe Bazaar logo there
(`public/icons/bazaar.png`); don't let the generator draw a logo.

| File (px) | What to draw | Text |
|---|---|---|
| `btn-bazaar-signin` (480×135) | the wood-button family, but the face is Bazaar green #0EA960 with a #09663A rim; an EMPTY rounded square on the left for the Bazaar logo | SIGN IN WITH BAZAAR |
| `btn-bazaar-connected` (480×125) | same shape, cream face with a green check mark in a small round seal on the left | SIGNED IN WITH BAZAAR |
| `btn-rate-review` (360×114) | green button, a gold star on the left | RATE & REVIEW |
| `btn-more-games` (360×114) | wood button, a small stack of game cards (or three tiny dohyo) on the left | MORE GAMES |
| `btn-auto-update` (360×114) | wood button, two circular arrows around a small down-arrow on the left | AUTO-UPDATE |
| `btn-update` (360×98) | green notice-family button, a down-arrow in a circle on the left | UPDATE |
| `icon-review` (256×256) | a paper scroll with a brush and a gold star stamp (for the About panel) | no text |

## 5. Full screens (layout mock-ups)

These are for direction only: the game builds its screens in code from the elements above.
Ask for a **portrait 1080×2340 mobile screenshot** and add this line to the style block:

```
Show the complete screen as a flat, front-on mobile game screenshot, portrait 1080x2340,
safe margins of 48 px, every element from the Mini Sumo UI kit, all text in English and
spelled exactly as listed. No device frame, no hands.
```

| Screen | Contents (top to bottom) |
|---|---|
| Loading | night festival background, MINI SUMO logo, rope-framed loading bar, "LOADING… 72%" |
| Name gate | welcome frame, "WELCOME!", "What should we call you?", input field, SAVE |
| Home | profile card (avatar, name, Lvl), coin counter; side icon column (friends, leaderboard, shop, settings); title header; one arena card with PLAY; bottom row Training, Customise, Private Room |
| Arena popup | arena card in a hanging board: picture, name, entry fee, prize, EASY/NORMAL/HARD faces, PLAY, round close button |
| Lobby / waiting | hanging board titled with the arena name, four player rows with P-badges, YOU and HOST tags, ADD RANDOM PLAYER, START MATCH countdown |
| Match HUD | four player frame strips top-left, taiko timer top-centre, settings top-right, dohyo in the middle, joystick bottom-left, dash drum bottom-right |
| Countdown / GO | the HUD with a giant "3" or "GO!" in the centre |
| Out of the bout | the HUD with "OUT" stamped on your frame, a red plank note "You're out! Watching the rest of the bout", RETURN HOME button |
| Finish | the HUD dimmed, OSHIDASHI! banner across the screen |
| Results | scoreboard with headline "YOU WIN!", four rows, coin and XP rewards, HOME and REMATCH |
| Level up | level-up frame, "LEVEL UP!", big level number, reward ribbon, GREAT! |
| Shop | hanging board "SHOP", coin pack cards with POPULAR / BEST VALUE ribbons and BUY buttons with prices |
| Wardrobe | big wrestler preview, tabs (Hair, Face, Outfit), grid of item thumbnails with BUY / equipped checks |
| Profile | profile card, stats plaques (bouts, wins, ring-outs), email and Google Play sign-in buttons |
| Friends | friend code plaque, friend cards with online dots and INVITE, ACCEPT / DECLINE requests |
| Leaderboard | leaderboard panel, rows with rank medals and score plaques, your row highlighted |
| Settings | music / sfx sliders with drum and bell icons, vibration toggle, joystick style choice, ABOUT |
| Notices | message / warning / error hanging boards with OK, RETRY, LEAVE / STAY buttons |
