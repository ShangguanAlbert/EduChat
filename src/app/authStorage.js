export const DEFAULT_AUTH_SLOT = "default";
export const LEGACY_USER_TOKEN_STORAGE_KEY = "token";
export const LEGACY_AUTH_USER_STORAGE_KEY = "auth_user";
export const LEGACY_ADMIN_TOKEN_STORAGE_KEY = "educhat_admin_token";

const AUTH_SLOT_QUERY_PARAM = "slot";
const ACTIVE_AUTH_SLOT_SESSION_KEY = "educhat:active-slot";
const AUTH_SLOT_STORAGE_PREFIX = "educhat:slot";

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function readWindowSearch() {
  if (!canUseBrowserStorage()) return "";
  return String(window.location.search || "");
}

function readSlotQueryValue(search = "") {
  try {
    const params = new URLSearchParams(String(search || ""));
    if (!params.has(AUTH_SLOT_QUERY_PARAM)) return null;
    return params.get(AUTH_SLOT_QUERY_PARAM);
  } catch {
    return null;
  }
}

function readSessionStorageValue(key) {
  if (!canUseBrowserStorage()) return "";
  try {
    return String(window.sessionStorage.getItem(key) || "");
  } catch {
    return "";
  }
}

function writeSessionStorageValue(key, value) {
  if (!canUseBrowserStorage()) return;
  try {
    window.sessionStorage.setItem(key, String(value || ""));
  } catch {
    // Ignore browser storage write failures.
  }
}

function readLocalStorageValue(key) {
  if (!canUseBrowserStorage()) return "";
  try {
    return String(window.localStorage.getItem(key) || "");
  } catch {
    return "";
  }
}

function writeLocalStorageValue(key, value) {
  if (!canUseBrowserStorage()) return;
  try {
    window.localStorage.setItem(key, String(value || ""));
  } catch {
    // Ignore browser storage write failures.
  }
}

function removeLocalStorageValue(key) {
  if (!canUseBrowserStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore browser storage write failures.
  }
}

function createScopedStorageKey(name, slot) {
  return `${AUTH_SLOT_STORAGE_PREFIX}:${sanitizeAuthSlot(slot, DEFAULT_AUTH_SLOT)}:${name}`;
}

function readScopedStorageValue(name, { slot, legacyKey = "" } = {}) {
  const safeSlot = sanitizeAuthSlot(slot, DEFAULT_AUTH_SLOT);
  const scopedValue = readLocalStorageValue(createScopedStorageKey(name, safeSlot));
  if (scopedValue) return scopedValue;
  if (safeSlot === DEFAULT_AUTH_SLOT && legacyKey) {
    return readLocalStorageValue(legacyKey);
  }
  return "";
}

function writeScopedStorageValue(name, value, { slot, legacyKey = "" } = {}) {
  const safeSlot = sanitizeAuthSlot(slot, DEFAULT_AUTH_SLOT);
  const safeValue = String(value || "");
  const scopedKey = createScopedStorageKey(name, safeSlot);
  if (!safeValue) {
    removeLocalStorageValue(scopedKey);
    if (safeSlot === DEFAULT_AUTH_SLOT && legacyKey) {
      removeLocalStorageValue(legacyKey);
    }
    return;
  }
  writeLocalStorageValue(scopedKey, safeValue);
  if (safeSlot === DEFAULT_AUTH_SLOT && legacyKey) {
    writeLocalStorageValue(legacyKey, safeValue);
  }
}

export function sanitizeAuthSlot(value, fallback = DEFAULT_AUTH_SLOT) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, 32);
  return normalized || fallback;
}

export function readAuthSlotFromSearch(search = readWindowSearch()) {
  const rawValue = readSlotQueryValue(search);
  if (rawValue == null) return "";
  return sanitizeAuthSlot(rawValue, DEFAULT_AUTH_SLOT);
}

export function resolveActiveAuthSlot(search = readWindowSearch()) {
  const slotFromSearch = readAuthSlotFromSearch(search);
  if (slotFromSearch) return slotFromSearch;
  return sanitizeAuthSlot(readSessionStorageValue(ACTIVE_AUTH_SLOT_SESSION_KEY), DEFAULT_AUTH_SLOT);
}

export function syncAuthSlotFromLocation(search = readWindowSearch()) {
  const slotFromSearch = readAuthSlotFromSearch(search);
  if (slotFromSearch) {
    writeSessionStorageValue(ACTIVE_AUTH_SLOT_SESSION_KEY, slotFromSearch);
    return slotFromSearch;
  }
  const activeSlot = resolveActiveAuthSlot(search);
  writeSessionStorageValue(ACTIVE_AUTH_SLOT_SESSION_KEY, activeSlot);
  return activeSlot;
}

export function withAuthSlot(path, slot = resolveActiveAuthSlot()) {
  const safePath = String(path || "").trim() || "/";
  const safeSlot = sanitizeAuthSlot(slot, DEFAULT_AUTH_SLOT);
  if (safeSlot === DEFAULT_AUTH_SLOT) return safePath;

  const hashIndex = safePath.indexOf("#");
  const pathWithoutHash = hashIndex >= 0 ? safePath.slice(0, hashIndex) : safePath;
  const hashSuffix = hashIndex >= 0 ? safePath.slice(hashIndex) : "";
  const queryIndex = pathWithoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? pathWithoutHash.slice(0, queryIndex) : pathWithoutHash;
  const search = queryIndex >= 0 ? pathWithoutHash.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(search);
  params.set(AUTH_SLOT_QUERY_PARAM, safeSlot);
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hashSuffix}`;
}

export function getUserToken(slot = resolveActiveAuthSlot()) {
  return readScopedStorageValue("token", {
    slot,
    legacyKey: LEGACY_USER_TOKEN_STORAGE_KEY,
  });
}

export function setUserToken(token, slot = resolveActiveAuthSlot()) {
  writeScopedStorageValue("token", String(token || "").trim(), {
    slot,
    legacyKey: LEGACY_USER_TOKEN_STORAGE_KEY,
  });
}

export function clearUserToken(slot = resolveActiveAuthSlot()) {
  writeScopedStorageValue("token", "", {
    slot,
    legacyKey: LEGACY_USER_TOKEN_STORAGE_KEY,
  });
}

export function setStoredAuthUser(user, slot = resolveActiveAuthSlot()) {
  const nextValue = user ? JSON.stringify(user) : "";
  writeScopedStorageValue("auth_user", nextValue, {
    slot,
    legacyKey: LEGACY_AUTH_USER_STORAGE_KEY,
  });
}

export function getStoredAuthUser(slot = resolveActiveAuthSlot()) {
  const raw = readScopedStorageValue("auth_user", {
    slot,
    legacyKey: LEGACY_AUTH_USER_STORAGE_KEY,
  });
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearStoredAuthUser(slot = resolveActiveAuthSlot()) {
  writeScopedStorageValue("auth_user", "", {
    slot,
    legacyKey: LEGACY_AUTH_USER_STORAGE_KEY,
  });
}

export function clearUserAuthSession(slot = resolveActiveAuthSlot()) {
  clearUserToken(slot);
  clearStoredAuthUser(slot);
}

export function getScopedAdminToken(slot = resolveActiveAuthSlot()) {
  return readScopedStorageValue("admin_token", {
    slot,
    legacyKey: LEGACY_ADMIN_TOKEN_STORAGE_KEY,
  });
}

export function setScopedAdminToken(token, slot = resolveActiveAuthSlot()) {
  writeScopedStorageValue("admin_token", String(token || "").trim(), {
    slot,
    legacyKey: LEGACY_ADMIN_TOKEN_STORAGE_KEY,
  });
}

export function clearScopedAdminToken(slot = resolveActiveAuthSlot()) {
  writeScopedStorageValue("admin_token", "", {
    slot,
    legacyKey: LEGACY_ADMIN_TOKEN_STORAGE_KEY,
  });
}
