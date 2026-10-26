// What's new in Cafe Bazaar for one version: required before every Bazaar build.
//
//   node tools/bazaar-notes.mjs check <out.json>   checks the notes and writes the ones to use
//   node tools/bazaar-notes.mjs clear              empties the file for the next version
//
// The notes come from (first match wins):
//   1. a manual run's inputs (env NOTES_FA and NOTES_EN; "\n" starts a new line), or
//   2. apps/mobile/bazaar-release-notes.json: { "version", "fa", "en" }, where version must be
//      the version being built (package.json). Edit it on the bazaar branch before pushing.
// Missing, empty, or written for another version: the check fails, so a release can't go out
// without them. After a release the file is emptied (clear), so the next one needs new notes.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../apps/mobile/bazaar-release-notes.json", import.meta.url);
const COMMENT =
  "What's new in Cafe Bazaar for the next version (required: a Bazaar build fails without it). Set version to the version being released (package.json) and write fa and en, on the bazaar branch. Emptied after each release.";
/** Longer notes are cut by Bazaar's page; keep them short. */
const MAX = 1000;

const [mode, out] = process.argv.slice(2);
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const fail = (message) => {
  console.log(`::error title=Cafe Bazaar release notes::${message}`);
  process.exit(1);
};
const clean = (text) => String(text ?? "").replaceAll("\\n", "\n").trim();

if (mode === "clear") {
  writeFileSync(FILE, `${JSON.stringify({ $comment: COMMENT, version: "", fa: "", en: "" }, null, 2)}\n`);
  console.log("Release notes emptied for the next version.");
  process.exit(0);
}
if (mode !== "check" || !out) fail("Usage: node tools/bazaar-notes.mjs check <out.json> | clear");

let notes;
let source;
const inputFa = clean(process.env.NOTES_FA);
const inputEn = clean(process.env.NOTES_EN);
if (inputFa || inputEn) {
  if (!inputFa || !inputEn) fail("Write both release notes (Persian and English) when running the workflow by hand.");
  notes = { fa: inputFa, en: inputEn };
  source = "inputs";
} else {
  let file;
  try {
    file = JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    fail("apps/mobile/bazaar-release-notes.json is missing or isn't valid JSON.");
  }
  const forVersion = String(file.version ?? "").trim();
  if (!forVersion) fail(`No release notes for ${version}: set "version": "${version}" and write "fa" and "en" in apps/mobile/bazaar-release-notes.json (on the bazaar branch), or run the workflow by hand with the notes.`);
  if (forVersion !== version) fail(`The release notes are for ${forVersion}, but this build is ${version}. Update apps/mobile/bazaar-release-notes.json for ${version}.`);
  notes = { fa: clean(file.fa), en: clean(file.en) };
  if (!notes.fa) fail(`The Persian release notes ("fa") for ${version} are empty.`);
  if (!notes.en) fail(`The English release notes ("en") for ${version} are empty.`);
  source = "file";
}
for (const [lang, text] of Object.entries(notes)) {
  if (text.length > MAX) fail(`The ${lang} release notes are ${text.length} characters; keep them under ${MAX}.`);
}

writeFileSync(out, JSON.stringify({ version, ...notes }));
console.log(`Release notes for ${version} (from ${source === "inputs" ? "the run's inputs" : "apps/mobile/bazaar-release-notes.json"}):\n--- fa ---\n${notes.fa}\n--- en ---\n${notes.en}`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `source=${source}\n`, { flag: "a" });
