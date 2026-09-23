import { spawn } from "node:child_process";

const npmCli = process.platform === "win32" ? process.env.npm_execpath : undefined;
if (process.platform === "win32" && !npmCli) {
  throw new Error("Run this verification through npm so npm_execpath is available.");
}
const steps = [
  ["Lint", ["run", "lint"]],
  ["Type-check", ["run", "check"]],
  ["Test", ["test"]],
];

for (const [label, args] of steps) {
  console.log(`\n[verify:quick] ${label}`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      npmCli ? process.execPath : "npm",
      npmCli ? [npmCli, ...args] : args,
      { stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${label} terminated by signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) process.exit(exitCode);
}

console.log("\n[verify:quick] All checks passed.");
