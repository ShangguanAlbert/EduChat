import { resolveActiveAuthSlot } from "../../app/authStorage.js";

const CHAT_BOOTSTRAP_PREFETCH_STORAGE_PREFIX = "educhat:chat:bootstrap-prefetch";

function resolveChatBootstrapPrefetchStorageKey(search = "") {
  const slot = resolveActiveAuthSlot(search);
  return `${CHAT_BOOTSTRAP_PREFETCH_STORAGE_PREFIX}:${slot}`;
}

export function writeChatBootstrapPrefetch(data, search = "") {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      resolveChatBootstrapPrefetchStorageKey(search),
      JSON.stringify(data || {}),
    );
  } catch {
    // Ignore bootstrap prefetch write failures.
  }
}

export function readChatBootstrapPrefetch(search = "") {
  if (typeof window === "undefined") return null;
  const storageKey = resolveChatBootstrapPrefetchStorageKey(search);
  try {
    const raw = String(window.sessionStorage.getItem(storageKey) || "").trim();
    if (!raw) return null;
    window.sessionStorage.removeItem(storageKey);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearChatBootstrapPrefetch(search = "") {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(
      resolveChatBootstrapPrefetchStorageKey(search),
    );
  } catch {
    // Ignore bootstrap prefetch cleanup failures.
  }
}
