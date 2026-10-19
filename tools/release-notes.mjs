// Writes the GitHub Release body. Env: VERSION, REPO (owner/name), SERVER_URL (optional).
const version = process.env.VERSION ?? "0.0.0";
const repo = process.env.REPO ?? "Jolly-Panda-Works/mini-sumo-3d";
const server = (process.env.SERVER_URL ?? "").trim();
const f = (kind) => `MiniSumo-${version}-${kind}`;

const serverNote = server
  ? `Online play: friends, the leaderboard, all arenas and the coin shop, through the game server at \`${server}\`. Without a connection the game still plays against bots, and progress syncs once you're back online.`
  : `This build has no game server set, so it plays against bots on the device only.`;

console.log(`## Mini Sumo ${version}

A 3D multiplayer party game for 2 to 4 players by [Usef Farahmand](https://www.useffarahmand.com). Push your friends out of the ring.

${serverNote}

### Downloads

| | File |
| --- | --- |
| Android (install on a phone) | \`${f("Android.apk")}\` (signed; if missing, use \`${f("Android-debug.apk")}\`) |
| Android (Google Play upload) | \`${f("Android.aab")}\` |
| Web (WebGL, ready to host) | \`${f("Web.zip")}\`: unzip onto any HTTPS web host; see \`HOSTING.txt\` inside |

Verify a download with \`SHA256SUMS.txt\`.
`);
