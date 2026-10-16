import { spawn } from "node:child_process";

/**
 * Runs checks across workspaces in order and fails on the first error.
 *
 * Exists because root package.json scripts cannot rely on `&&`: on this
 * machine npm's script-shell is PowerShell, and PowerShell 5.1 treats `&&`
 * as a parse error. A node runner works the same on every platform.
 */
const STEPS = {
  typecheck: [
    ["typecheck", "@recallai/web"],
    ["typecheck", "@recallai/api"],
  ],
  build: [
    ["build", "@recallai/web"],
    ["build", "@recallai/api"],
  ],
  lint: [["lint", "@recallai/web"]],
};

const which = process.argv[2] ?? "typecheck";
const steps = STEPS[which];

if (!steps) {
  console.error(`Unknown step "${which}". Try: ${Object.keys(STEPS).join(", ")}`);
  process.exit(1);
}

function run([script, workspace]) {
  return new Promise((resolve) => {
    console.log(`\n> ${workspace}: ${script}`);
    // .cmd shims cannot be spawned directly on Windows without a shell.
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", script, "--workspace", workspace],
      { stdio: "inherit", shell: process.platform === "win32" },
    );
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

let failed = 0;
for (const step of steps) {
  const code = await run(step);
  if (code !== 0) {
    console.error(`\n${which} failed in ${step[1]}: ${step[0]}`);
    failed = code;
    break;
  }
}

if (failed === 0) console.log(`\n${which}: all steps passed`);
process.exit(failed);