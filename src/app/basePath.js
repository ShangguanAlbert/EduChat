function normalizeBasePath(value = "/") {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "/";

  let pathname = raw;
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname || "/";
    } catch {
      pathname = raw;
    }
  }

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  pathname = pathname.replace(/\/{2,}/g, "/");
  if (pathname !== "/" && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  return pathname === "/" ? "/" : `${pathname}/`;
}

const APP_BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL || "/");
const APP_BASE_PREFIX = APP_BASE_PATH === "/" ? "" : APP_BASE_PATH.slice(0, -1);

function isExternalUrl(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
}

function prefixAbsoluteUrlIfNeeded(value) {
  if (typeof window === "undefined") return value;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }

  if (parsed.origin !== window.location.origin) {
    return value;
  }

  const nextPath = withAppBasePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  if (nextPath === `${parsed.pathname}${parsed.search}${parsed.hash}`) {
    return value;
  }
  return `${parsed.origin}${nextPath}`;
}

export function getAppBasePath() {
  return APP_BASE_PATH;
}

export function getRouterBasename() {
  return APP_BASE_PREFIX || undefined;
}

export function stripAppBasePath(value = "") {
  const text = String(value || "").trim();
  if (!text || APP_BASE_PATH === "/") return text;
  if (text === APP_BASE_PREFIX) return "/";
  if (text.startsWith(`${APP_BASE_PREFIX}/`)) {
    return text.slice(APP_BASE_PREFIX.length) || "/";
  }
  return text;
}

export function withAppBasePath(value = "") {
  const text = String(value || "").trim();
  if (!text || APP_BASE_PATH === "/") return text;
  if (isExternalUrl(text)) return text;
  if (!text.startsWith("/")) return text;
  if (text === APP_BASE_PREFIX || text.startsWith(`${APP_BASE_PREFIX}/`)) {
    return text;
  }
  return `${APP_BASE_PREFIX}${text}`;
}

export function resolveWebSocketUrl(path = "") {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${withAppBasePath(path)}`;
}

export function installScopedFetch() {
  if (typeof window === "undefined") return;
  if (window.__educhatScopedFetchInstalled) return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    if (typeof input === "string") {
      return nativeFetch(withAppBasePath(input), init);
    }

    if (input instanceof URL) {
      const nextUrl = prefixAbsoluteUrlIfNeeded(input.toString());
      return nativeFetch(nextUrl === input.toString() ? input : new URL(nextUrl), init);
    }

    if (input instanceof Request) {
      const nextUrl = prefixAbsoluteUrlIfNeeded(input.url);
      return nativeFetch(nextUrl === input.url ? input : new Request(nextUrl, input), init);
    }

    return nativeFetch(input, init);
  };

  window.__educhatScopedFetchInstalled = true;
}
