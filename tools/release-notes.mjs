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

| Platform | File |
| --- | --- |
| Windows (installer) | \`${f("Windows-Setup.exe")}\` |
| Windows (portable, no install) | \`${f("Windows-Portable.exe")}\` |
| macOS Apple Silicon | \`${f("macOS-arm64.dmg")}\` |
| macOS Intel | \`${f("macOS-x64.dmg")}\` |
| Linux | \`${f("Linux-x86_64.AppImage")}\` or \`${f("Linux-amd64.deb")}\` |
| Android (install on a phone) | \`${f("Android.apk")}\` (signed; if missing, use \`${f("Android-debug.apk")}\`) |
| Android (Google Play upload) | \`${f("Android.aab")}\` |
| Web (static site) | \`${f("Web.zip")}\` |

Verify a download with \`SHA256SUMS.txt\`. The apps are not code-signed yet, see [CODE_SIGNING.md](https://github.com/${repo}/blob/main/CODE_SIGNING.md) for the Windows SmartScreen and macOS Gatekeeper steps.
`);
