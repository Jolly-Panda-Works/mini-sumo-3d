// Writes the GitHub Release body. Env: VERSION, REPO (owner/name), SERVER_URL (optional).
const version = process.env.VERSION ?? "0.0.0";
const repo = process.env.REPO ?? "Jolly-Panda-Works/mini-sumo-3d";
const server = (process.env.SERVER_URL ?? "").trim();
const f = (kind) => `MiniSumo-${version}-${kind}`;

const serverNote = server
  ? `These builds connect to the game server at \`${server}\`.`
  : `> [!WARNING]
> **The public game server is not live yet.** These builds were made without \`VITE_SERVER_URL\`, so they can't find an online room on their own.
> You can still play on your own network: run the server from source (\`npm run dev:server\`) and open the game on the same machine.`;

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
| Android | \`${f("Android.apk")}\` |
| Web (static site) | \`${f("Web.zip")}\` |

Verify a download with \`SHA256SUMS.txt\`. The apps are not code-signed yet, see [CODE_SIGNING.md](https://github.com/${repo}/blob/main/CODE_SIGNING.md) for the Windows SmartScreen and macOS Gatekeeper steps.
`);
