import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const API_HOST = "127.0.0.1";
const API_PORT = 8787;
const API_READY_TIMEOUT_MS = 30000;
const API_READY_POLL_INTERVAL_MS = 220;

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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function canConnectPort({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(900);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitForApiReady() {
  const deadline = Date.now() + API_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ok = await canConnectPort({ host: API_HOST, port: API_PORT });
    if (ok) return true;
    await sleep(API_READY_POLL_INTERVAL_MS);
  }
  return false;
}

async function main() {
  run("server", npmCmd, ["run", "server"]);
  const ready = await waitForApiReady();
  if (!ready) {
    console.warn(
      `[dev] API server did not become reachable on ${API_HOST}:${API_PORT} within ${
        API_READY_TIMEOUT_MS / 1000
      }s; starting Vite anyway.`,
    );
  }
  run("vite", npmCmd, ["run", "dev:web"]);
}

void main();
