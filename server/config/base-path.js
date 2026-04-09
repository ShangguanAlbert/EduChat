export function normalizeBasePath(value = "/") {
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

export function resolveConfiguredBasePath() {
  return normalizeBasePath(process.env.EDUCHAT_BASE_PATH || process.env.BASE_PATH || "/");
}

export function stripBasePath(pathname = "", basePath = "/") {
  const normalizedBasePath = normalizeBasePath(basePath);
  const text = String(pathname || "").trim() || "/";
  if (normalizedBasePath === "/") return text;

  const prefix = normalizedBasePath.slice(0, -1);
  if (text === prefix) return "/";
  if (text.startsWith(`${prefix}/`)) {
    return text.slice(prefix.length) || "/";
  }
  return text;
}

export function withBasePath(pathname = "", basePath = "/") {
  const normalizedBasePath = normalizeBasePath(basePath);
  const text = String(pathname || "").trim();
  if (!text || normalizedBasePath === "/") return text;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith("//")) return text;
  if (!text.startsWith("/")) return text;

  const prefix = normalizedBasePath.slice(0, -1);
  if (text === prefix || text.startsWith(`${prefix}/`)) {
    return text;
  }
  return `${prefix}${text}`;
}
