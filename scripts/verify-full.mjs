import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const steps = [
  ["Quick verification", ["run", "verify:quick"]],
  ["Production build", ["run", "build"]],
  ["Release asset validation", ["run", "validate:release"]],
];

for (const [label, args] of steps) {
  console.log(`\n[verify:full] ${label}`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(npm, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${label} terminated by signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) process.exit(exitCode);
}

console.log("\n[verify:full] All checks passed.");
