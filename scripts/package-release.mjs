import { cp, mkdir, rm } from "node:fs/promises";

const assets = ["main.js", "manifest.json", "styles.css"];
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await Promise.all(assets.map((asset) => cp(asset, `dist/${asset}`)));
