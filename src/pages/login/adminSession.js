export const ADMIN_TOKEN_STORAGE_KEY = "educhat_admin_token";

export function getAdminToken() {
  return String(localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "");
}

export function setAdminToken(token) {
  const value = String(token || "").trim();
  if (!value) {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, value);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}
