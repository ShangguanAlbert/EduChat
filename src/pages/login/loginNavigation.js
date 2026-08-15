export const DEFAULT_ADMIN_LOGIN_TARGET = "/admin/settings";

function normalizeLocationSuffix(value, prefix) {
  const text = String(value || "");
  return text.startsWith(prefix) ? text : "";
}

export function resolveAdminLoginTarget(fromLocation) {
  const pathname = String(fromLocation?.pathname || "").trim();
  const isInternalAdminPath =
    pathname === "/admin" ||
    (pathname.startsWith("/admin/") && !pathname.startsWith("//"));

  if (!isInternalAdminPath) {
    return DEFAULT_ADMIN_LOGIN_TARGET;
  }

  const search = normalizeLocationSuffix(fromLocation?.search, "?");
  const hash = normalizeLocationSuffix(fromLocation?.hash, "#");
  return `${pathname}${search}${hash}`;
}
