# Code signing

Mini Sumo's desktop and Android builds are currently **not code-signed**. Code-signing certificates cost money, and this is a free, open-source hobby project. The builds are produced by GitHub Actions from this repository, so you can always check exactly what went into them.

## What you'll see

**Windows:** *"Windows protected your PC"* (SmartScreen). Click **More info → Run anyway**.

**macOS:** *"Mini Sumo can't be opened because Apple cannot check it for malicious software."* Right-click (or Control-click) the app in Applications and choose **Open**, then **Open** again. Or run:

```bash
xattr -dr com.apple.quarantine "/Applications/Mini Sumo.app"
```

**Linux:** make the AppImage executable: `chmod +x MiniSumo-*.AppImage`.

**Android:** the APK is installed outside Google Play, so allow *Install unknown apps* for your browser or file manager when prompted.

## Verify your download

Every release includes `SHA256SUMS.txt`.

```bash
# macOS / Linux
shasum -a 256 MiniSumo-0.1.12-Linux-x86_64.AppImage
# Windows (PowerShell)
Get-FileHash .\MiniSumo-0.1.12-Windows-Setup.exe -Algorithm SHA256
```

The hash must match the line for that file in `SHA256SUMS.txt`.

## Build it yourself

Prefer not to trust a binary? Build from source: see *Run from source* and *Build the apps yourself* in the [README](README.md).

## Plans

- **Windows:** a free open-source signing program (such as SignPath Foundation) or Microsoft Store distribution.
- **macOS:** an Apple Developer ID and notarization.
- **Android:** a signed release build (the workflow already supports a keystore through repository secrets) and possibly Google Play.
