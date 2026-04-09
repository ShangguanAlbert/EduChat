import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBasePath(value = "/") {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "/";

  let pathname = raw;
  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  pathname = pathname.replace(/\/{2,}/g, "/");
  if (pathname !== "/" && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  return pathname === "/" ? "/" : `${pathname}/`;
}

function buildProxyEntries(basePath) {
  const entries = {
    "/api": {
      target: "http://127.0.0.1:8787",
      changeOrigin: true,
    },
    "/ws": {
      target: "ws://127.0.0.1:8787",
      ws: true,
      changeOrigin: true,
    },
  };

  if (basePath === "/") {
    return entries;
  }

  const prefix = basePath.slice(0, -1);
  entries[`${prefix}/api`] = {
    target: "http://127.0.0.1:8787",
    changeOrigin: true,
    rewrite: (path) => path.slice(prefix.length) || "/",
  };
  entries[`${prefix}/ws`] = {
    target: "ws://127.0.0.1:8787",
    ws: true,
    changeOrigin: true,
    rewrite: (path) => path.slice(prefix.length) || "/",
  };

  return entries;
}

export default defineConfig(() => {
  const basePath = normalizeBasePath(process.env.EDUCHAT_BASE_PATH || "/");

  return {
    base: basePath,
    plugins: [react()],
    server: {
      proxy: buildProxyEntries(basePath),
    },
  };
});
