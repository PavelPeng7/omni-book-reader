import { readFile, stat } from "node:fs/promises";

const RELEASE_ASSETS = ["main.js", "manifest.json", "styles.css"];
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const COMMUNITY_PLUGIN_ID = "omnireader";
const COMMUNITY_PLUGIN_NAME = "Omni Reader";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function requireVersion(value, source) {
  if (typeof value !== "string" || !SEMVER_PATTERN.test(value)) {
    throw new Error(`${source} must contain a valid semantic version.`);
  }

  return value;
}

const manifest = await readJson("manifest.json");
const packageJson = await readJson("package.json");

if (manifest.id !== COMMUNITY_PLUGIN_ID) {
  throw new Error(
    `manifest.json id must remain ${COMMUNITY_PLUGIN_ID} for the existing community plugin entry.`,
  );
}

if (manifest.name !== COMMUNITY_PLUGIN_NAME) {
  throw new Error(
    `manifest.json name must remain ${COMMUNITY_PLUGIN_NAME} for the existing community plugin entry.`,
  );
}

const manifestVersion = requireVersion(manifest.version, "manifest.json");
const packageVersion = requireVersion(packageJson.version, "package.json");

if (manifestVersion !== packageVersion) {
  throw new Error(
    `Version mismatch: manifest.json=${manifestVersion}, package.json=${packageVersion}.`,
  );
}

const versions = await readJson("versions.json");
if (versions[manifestVersion] !== manifest.minAppVersion) {
  throw new Error(
    `versions.json must map ${manifestVersion} to minAppVersion ${manifest.minAppVersion}.`,
  );
}

if (process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REF_TYPE !== "tag") {
  throw new Error("GitHub releases must be triggered by a version tag.");
}

if (process.env.GITHUB_REF_TYPE === "tag") {
  const tag = process.env.GITHUB_REF_NAME;
  if (tag !== manifestVersion) {
    throw new Error(
      `Release tag ${tag ?? "<missing>"} must match manifest version ${manifestVersion}.`,
    );
  }
}

const assetSizes = await Promise.all(
  RELEASE_ASSETS.map(async (asset) => {
    const details = await stat(asset);
    if (!details.isFile() || details.size === 0) {
      throw new Error(`Release asset ${asset} is missing or empty.`);
    }
    return [asset, details.size];
  }),
);

const summary = assetSizes
  .map(([asset, size]) => `${asset}=${(size / 1024).toFixed(1)} KiB`)
  .join(", ");

console.log(`Release ${manifestVersion} validated: ${summary}`);
