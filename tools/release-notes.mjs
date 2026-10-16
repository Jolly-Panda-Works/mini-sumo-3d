// Writes the GitHub Release body. Env: VERSION, REPO (owner/name), SERVER_URL (optional).
const version = process.env.VERSION ?? "0.0.0";
const repo = process.env.REPO ?? "Jolly-Panda-Works/mini-sumo-3d";
const server = (process.env.SERVER_URL ?? "").trim();
const f = (kind) => `MiniSumo-${version}-${kind}`;

const serverNote = server
  ? `These builds connect to the game server at \`${server}\`.`
  : `> [!NOTE]
> **Online play is coming soon.** This build includes the free Training Arena against bots; paid arenas, coins, the shop and playing with friends arrive once the game server is live.`;

console.log(`## Mini Sumo ${version}

A 3D multiplayer party game for 2 to 4 players by [Usef Farahmand](https://www.useffarahmand.com). Push your friends out of the ring.

${serverNote}

### Downloads

| | File |
| --- | --- |
| Android (install on a phone) | \`${f("Android.apk")}\` (signed; if missing, use \`${f("Android-debug.apk")}\`) |
| Android (Google Play upload) | \`${f("Android.aab")}\` |

Play the web version for testing on [GitHub Pages](https://${repo.split("/")[0].toLowerCase()}.github.io/${repo.split("/")[1]}/). Verify a download with \`SHA256SUMS.txt\`.
`);
