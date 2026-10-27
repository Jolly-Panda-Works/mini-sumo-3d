# Mini Sumo banners

Created with the built-in ImageGen tool, using the existing game logo and Japanese UI artwork as references. Final prompts are in `prompts.json`.

- `mini-sumo-social-v1`: 1200 × 630 link preview, with larger lettering and a simpler composition.
- `mini-sumo-intro-v1`: 1920 × 1080 introduction banner.

Only the link preview's JPEG ships with the game: `apps/client/public/social/mini-sumo-social-v1.jpg` (everything in `public/` goes into every web, desktop and Android build). The other formats and the intro banner are in `banners/` here.

`apps/client/index.html` contains static Open Graph and Twitter large-image metadata. The preview uses the JPEG at `https://sumo.ryujin.fans/social/mini-sumo-social-v1.jpg`, so crawlers can read it without running JavaScript; it appears once the server runs a build with it. For a different primary host, update the absolute URLs in the HTML. Social platforms may keep an earlier cached preview for links already shared; a new image needs a new file name (e.g. `-v2`).

`export_banners.py` records the local generation source paths and exports all formats into `apps/client/public/social`; after running it, keep only the JPEG there and move the rest to `banners/`.
