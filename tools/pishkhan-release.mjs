// Sends a signed APK to Cafe Bazaar as a new release and asks Bazaar to review it, through the
// Pishkhan (developer panel) API: https://developers.cafebazaar.ir/fa/guidelines/feature/pishkhan-api
//
//   node tools/pishkhan-release.mjs <apk> --version 1.33.0 --code 1033000 --changelog notes.json
//
// Env:
//   BAZAAR_PISHKHAN_TOKEN    the app's API token (panel -> the app -> "API پیشخان بازار")
//   BAZAAR_CHANNEL           "public" (default): sent for review for everyone;
//                            "alpha": uploaded as a draft only. The API can't pick the release
//                            group, so in the panel choose "آلفا" and your alpha group for it
//                            and send it for review yourself (later, switch it to public there).
//   BAZAAR_AUTO_PUBLISH      "true" (default): published as soon as Bazaar approves it;
//                            "false": you press "انتشار رهانش" in the panel yourself
//
// Steps: skip if Bazaar already has this versionCode (released, in review, or a draft waiting
// for you) -> drop an older draft left by a failed run -> create a release -> upload the APK ->
// commit it for review with the changelog (public) or leave it as a draft (alpha).
// The changelog: { fa, en } from tools/bazaar-notes.mjs (checked before the build).
import { existsSync, openAsBlob, readFileSync } from "node:fs";

// PISHKHAN_API_URL is only for testing against a mock.
const API = process.env.PISHKHAN_API_URL || "https://api.pishkhan.cafebazaar.ir/v1/apps/releases/";
const args = process.argv.slice(2);
const apk = args[0]?.startsWith("--") ? undefined : args[0];
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const version = opt("version");
const code = Number(opt("code"));
const changelogFile = opt("changelog");
const token = (process.env.BAZAAR_PISHKHAN_TOKEN ?? "").trim();
const autoPublish = (process.env.BAZAAR_AUTO_PUBLISH ?? "true").trim().toLowerCase() !== "false";
const alpha = (process.env.BAZAAR_CHANNEL ?? "public").trim().toLowerCase() === "alpha";

const fail = (message) => {
  console.log(`::error::${message}`);
  process.exit(1);
};
if (!token) fail("BAZAAR_PISHKHAN_TOKEN is not set.");
if (!apk || !existsSync(apk)) fail(`APK not found: ${apk}`);
if (!version || !Number.isFinite(code) || code <= 0) fail("Pass --version and --code.");
if (!changelogFile || !existsSync(changelogFile)) fail("Pass --changelog (the notes checked by tools/bazaar-notes.mjs).");
const notes = JSON.parse(readFileSync(changelogFile, "utf8"));
if (!String(notes.fa ?? "").trim() || !String(notes.en ?? "").trim()) fail("The release notes are empty.");

/** One API call; retries a few times when Bazaar says "too many requests". */
async function call(method, path = "", body) {
  for (let attempt = 1; ; attempt++) {
    const headers = { "CAFEBAZAAR-PISHKHAN-API-SECRET": token };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(API + path, { method, headers, body: payload });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { message: text.slice(0, 300) };
    }
    if (res.status === 429 && attempt < 5) {
      console.log(`Bazaar says too many requests; waiting ${attempt * 20} s…`);
      await new Promise((r) => setTimeout(r, attempt * 20_000));
      continue;
    }
    return { status: res.status, json };
  }
}

const highestCode = (release) => Math.max(0, ...(release?.packages ?? []).map((p) => Number(p.version_code) || 0));

// 1. Already on Bazaar (a re-run, or the version wasn't bumped): nothing to do.
for (const which of ["last-committed/", "last-published/"]) {
  const { json } = await call("GET", which);
  if (json.type === "success" && highestCode(json.release) >= code) {
    console.log(`::notice::Cafe Bazaar already has versionCode ${highestCode(json.release)} (${which.slice(0, -1)}); not sending ${version} (${code}).`);
    process.exit(0);
  }
}

// 2. A draft of this version (an alpha waiting for you in the panel) is kept; an older one,
// left by a failed run, would block the new release.
const draft = await call("GET", "last-uncommitted/");
if (draft.json.type === "success" && highestCode(draft.json.release) >= code) {
  console.log(`::notice::A draft of versionCode ${highestCode(draft.json.release)} is already in the Bazaar panel; not sending ${version} again.`);
  process.exit(0);
}
if (draft.json.type === "success") {
  console.log(`Removing an unfinished draft release (versionCode ${highestCode(draft.json.release) || "none"}).`);
  const removed = await call("DELETE");
  if (removed.status !== 200) fail(`Couldn't remove the draft release: ${removed.json.message ?? removed.status}`);
}

// 3. New release.
const created = await call("POST");
if (created.status !== 201 && created.status !== 200) fail(`Couldn't create the release: ${created.json.message ?? created.status}`);
console.log("Release created.");

// 4. The APK.
const form = new FormData();
form.append("architecture", "all");
form.append("apk", await openAsBlob(apk, { type: "application/vnd.android.package-archive" }), apk.split(/[\\/]/).pop());
const uploaded = await call("POST", "upload/", form);
if (uploaded.status !== 200) fail(`Couldn't upload the APK: ${uploaded.json.message ?? uploaded.status}`);
const pkg = uploaded.json.package ?? {};
console.log(`APK uploaded: version ${pkg.version_name} (${pkg.version_code}), ${pkg.apk_size} bytes.`);

// 5. Alpha: stays a draft; the release group is chosen in the panel.
if (alpha) {
  console.log(
    `::notice::Mini Sumo ${version} is uploaded to Cafe Bazaar as a draft for the alpha group. In the panel (رهانش‌ها -> مدیریت رهانش‌ها), set its release group to "آلفا", pick your alpha group and send it for review. Later, switch the group to public there to release it to everyone.`,
  );
  process.exit(0);
}

// 6. Ask Bazaar to review it.
const committed = await call("POST", "commit/", {
  changelog_fa: notes.fa,
  changelog_en: notes.en,
  developer_note: `Mini Sumo ${version} (versionCode ${code}), sent automatically by GitHub Actions.`,
  auto_publish: autoPublish,
  staged_rollout_percentage: 100,
});
if (committed.status !== 200) fail(`Couldn't send the release for review: ${committed.json.message ?? committed.status}`);
console.log(
  `::notice::Mini Sumo ${version} is with Cafe Bazaar for review${autoPublish ? "; it's published as soon as it's approved" : "; publish it in the panel once approved"}.`,
);
