import esbuild from "esbuild";
import process from "node:process";
import { builtinModules } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const production = process.argv[2] === "production";

// Obsidian reads versions.json to resolve the newest release an app version
// may install; keep it in step with manifest.json on every production build.
function syncVersions() {
  const { version, minAppVersion } = JSON.parse(readFileSync("manifest.json", "utf8"));
  const versions = JSON.parse(readFileSync("versions.json", "utf8"));
  if (versions[version] === minAppVersion) return;
  versions[version] = minAppVersion;
  writeFileSync("versions.json", `${JSON.stringify(versions, null, 2)}\n`);
}

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: [
    "obsidian",
    "electron",
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ],
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  logLevel: "info",
});

if (production) {
  await context.rebuild();
  await context.dispose();
  syncVersions();
} else {
  await context.watch();
}
