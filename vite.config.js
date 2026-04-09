import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);
const pdfjsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json"));
const pdfjsAssetDirs = {
  cmaps: path.join(pdfjsDistPath, "cmaps"),
  wasm: path.join(pdfjsDistPath, "wasm"),
  standard_fonts: path.join(pdfjsDistPath, "standard_fonts"),
};

function readContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".bcmap") return "application/octet-stream";
  if (ext === ".wasm") return "application/wasm";
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".otf") return "font/otf";
  if (ext === ".pfb" || ext === ".pfm") return "application/octet-stream";
  if (ext === ".mjs" || ext === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function normalizeRequestPath(url = "") {
  return String(url || "").split("?")[0].split("#")[0];
}

function createPdfjsAssetPlugin(basePath) {
  const assetPrefix = `${basePath}pdfjs/`;
  let resolvedConfig = null;

  return {
    name: "educhat-pdfjs-assets",
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = normalizeRequestPath(req.url);
        if (!requestPath.startsWith(assetPrefix)) {
          next();
          return;
        }

        const relativePath = requestPath.slice(assetPrefix.length);
        const [rootDir, ...rest] = relativePath.split("/");
        const sourceDir = pdfjsAssetDirs[rootDir];
        if (!sourceDir || rest.length === 0) {
          next();
          return;
        }

        const targetPath = path.join(sourceDir, ...rest);
        if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
          next();
          return;
        }

        res.setHeader("Content-Type", readContentType(targetPath));
        res.end(fs.readFileSync(targetPath));
      });
    },
    writeBundle() {
      const outDir = resolvedConfig?.build?.outDir
        ? path.resolve(resolvedConfig.root, resolvedConfig.build.outDir)
        : path.resolve(process.cwd(), "dist");
      const targetRoot = path.join(outDir, "pdfjs");
      fs.mkdirSync(targetRoot, { recursive: true });
      Object.entries(pdfjsAssetDirs).forEach(([dirName, sourceDir]) => {
        fs.cpSync(sourceDir, path.join(targetRoot, dirName), { recursive: true });
      });
    },
  };
}

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
    plugins: [react(), createPdfjsAssetPlugin(basePath)],
    server: {
      proxy: buildProxyEntries(basePath),
    },
  };
});
