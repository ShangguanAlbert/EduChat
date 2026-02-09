import { spawn } from "node:child_process";
import process from "node:process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const children = [];
let exiting = false;

function run(name, cmd, args) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    env: process.env,
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (exiting) return;
    if (code === 0 || signal === "SIGTERM") return;

    console.error(`[${name}] exited unexpectedly (code=${code}, signal=${signal}).`);
    shutdown(code || 1);
  });

  return child;
}

function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill("SIGKILL");
    }
    process.exit(code);
  }, 600);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("server", npmCmd, ["run", "server"]);
run("vite", npmCmd, ["run", "dev:web"]);
